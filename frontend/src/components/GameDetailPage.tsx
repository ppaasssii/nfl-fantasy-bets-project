// frontend/src/components/GameDetailPage.tsx
import React, { useEffect, useState, useMemo, useCallback, Fragment } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { toast } from 'react-toastify';
import { Tab, Disclosure } from '@headlessui/react';
import { ChevronUpIcon, ArrowLeftIcon, UserCircleIcon } from '@heroicons/react/20/solid';
import { useDashboardOutletContext } from '../App';
import { americanToDecimal } from '../utils/oddsConverter';

// --- Types ---
interface Game { id: number; api_game_id: string; home_team: string; away_team: string; game_time: string; status: string; home_score?: number | null; away_score?: number | null; }
interface BetTypeInterface { id: number; name: string; api_market_key: string; description?: string; }
export interface AvailableBetDetail {
    id: number; game_id: number; bet_type_id: number; selection_name: string;
    odds: number; line?: number | null; is_active: boolean; is_winning_outcome?: boolean | null;
    source_bookmaker?: string | null; api_last_update?: string | null;
    bet_type: Pick<BetTypeInterface, 'id' | 'name' | 'api_market_key' | 'description'>;
    game_info_for_slip: { id: number; api_game_id: string; home_team: string; away_team: string; game_time: string; }
}

// --- HELPER FUNCTIONS (Defined before use in useMemo) ---
const groupOddsByBetTypeName = (oddsList: AvailableBetDetail[]): Record<string, AvailableBetDetail[]> => {
    return oddsList.reduce((acc, odd) => {
        const key = odd.bet_type?.name || 'Other Bets';
        if (!acc[key]) acc[key] = [];
        acc[key].push(odd);
        return acc;
    }, {} as Record<string, AvailableBetDetail[]>);
};

const extractPlayerNameFromSelection = (selectionName: string, betTypeName: string): string => {
    let name = selectionName
        .replace(/ (Over|Under) [\d.\-]+$/, '')
        .replace(/ (Yes|No)$/i, '')
        .trim();
    const betTypeBase = betTypeName.replace(/^Player /i, '').replace(/ O\/U$/i, '').replace(/ Yes\/No$/i, '').trim();
    if (name.toLowerCase().endsWith(betTypeBase.toLowerCase())) {
        name = name.substring(0, name.length - betTypeBase.length).trim();
    } else if (name.toLowerCase().startsWith(betTypeBase.toLowerCase())) {
        name = name.substring(betTypeBase.length).trim();
    }
    return name || "Unknown Player";
};

interface ProcessedMarketLine {
    lineValue: number | null;
    options: AvailableBetDetail[];
}
interface ProcessedMarket {
    marketName: string;
    lines: ProcessedMarketLine[];
}

const processOddsForDisplay = (
    oddsListForType: AvailableBetDetail[], // Odds already filtered for a specific bet_type.name
    marketBetTypeName: string
): ProcessedMarket => {
    const baseMarketName = marketBetTypeName.replace(/^Player /i, '').replace(/ O\/U$/i, '').replace(/ Yes\/No$/i, '').trim();
    const linesMap: Map<string, ProcessedMarketLine> = new Map();

    oddsListForType.forEach(odd => {
        let lineKey = 'no_line_group'; // Default for non-line-based markets (H2H, Y/N, E/O)
        if (odd.bet_type.api_market_key.endsWith('_ou') || odd.bet_type.api_market_key.includes('spreads')) {
            lineKey = (odd.line === null || odd.line === undefined) ? 'null_line' : String(odd.line);
        }
        if (!linesMap.has(lineKey)) { linesMap.set(lineKey, { lineValue: odd.line, options: [] }); }
        linesMap.get(lineKey)!.options.push(odd);
    });
    return { marketName: baseMarketName, lines: Array.from(linesMap.values()) };
};


// --- GameDetailPage Component ---
const GameDetailPage: React.FC = () => {
    const { dbGameId } = useParams<{ dbGameId: string }>();
    const [game, setGame] = useState<Game | null>(null);
    const [oddsData, setOddsData] = useState<AvailableBetDetail[] | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const { addToBetSlip, isOddInBetSlip } = useDashboardOutletContext();

    const fetchGameDetailsAndOdds = useCallback(async () => {
        if (!dbGameId) { setError("Game ID missing."); setLoading(false); return; }
        const gameIdNumber = parseInt(dbGameId, 10);
        if (isNaN(gameIdNumber)) { setError("Invalid Game ID."); setLoading(false); return; }
        setLoading(true); setError(null);
        try {
            const { data: gameDetails, error: gameError } = await supabase.from('games').select('*').eq('id', gameIdNumber).single();
            if (gameError) throw gameError; if (!gameDetails) throw new Error('Game not found.');
            setGame(gameDetails as Game);
            const { data: fetchedOdds, error: oddsError } = await supabase.from('available_bets').select(`*, bet_type:bet_types!inner(id, name, api_market_key, description)`).eq('game_id', gameDetails.id).eq('is_active', true).order('bet_type_id').order('line', { ascending: true, nullsFirst: true }).order('selection_name');
            if (oddsError) throw oddsError;
            const oddsWithCtx = fetchedOdds?.map(o=>({...o, game_info_for_slip:{id:gameDetails.id,api_game_id:gameDetails.api_game_id,home_team:gameDetails.home_team,away_team:gameDetails.away_team,game_time:gameDetails.game_time}}))||[];
            setOddsData(oddsWithCtx as AvailableBetDetail[]);
        } catch (err:any) { console.error('Err GameDetailFetch:', err); setError(err.message); toast.error(`Load err: ${err.message}`); }
        finally { setLoading(false); }
    }, [dbGameId]);

    useEffect(() => { fetchGameDetailsAndOdds(); }, [fetchGameDetailsAndOdds]);

    const handleOddSelectWrapper = (odd: AvailableBetDetail) => {
        if (isOddInBetSlip(odd.id)) { toast.info(`${odd.selection_name} is already in slip.`); return; }
        if (!odd.is_active) { toast.warn('Bet no longer active.'); return; }
        addToBetSlip(odd);
    };

    const processedTabsData = useMemo(() => {
        if (!oddsData) return { tabOrder: [], contentByTab: {} };
        const dataByTab: Record<string, AvailableBetDetail[]> = { 'All': [...oddsData], 'Game': [], 'Player Props': [], 'Period Markets': [] };
        const periodKeys = ['1q_', '2q_', '1h_', '3q_', '4q_', '2h_'];
        oddsData.forEach(odd => {
            const marketKey = odd.bet_type?.api_market_key?.toLowerCase() || 'unknown';
            if (['h2h', 'spreads', 'totals', 'team_points_home_ou', 'team_points_away_ou', 'game_total_eo', 'team_points_home_eo', 'team_points_away_eo', 'reg_ml3way', 'reg_double_chance'].includes(marketKey)) dataByTab['Game'].push(odd);
            else if (marketKey.startsWith('player_')) dataByTab['Player Props'].push(odd);
            else if (periodKeys.some(pk => marketKey.startsWith(pk))) dataByTab['Period Markets'].push(odd);
        });
        const tabOrder = ['All', 'Game', 'Player Props', 'Period Markets'].filter(name => dataByTab[name]?.length > 0);
        const contentByTab: Record<string, any> = {};
        if (dataByTab['Game'].length > 0) { const gmgbt = groupOddsByBetTypeName(dataByTab['Game']); contentByTab['Game'] = {}; for (const btn in gmgbt) contentByTab['Game'][btn] = processOddsForDisplay(gmgbt[btn], btn); }
        if (dataByTab['Player Props'].length > 0) { const ppgbn: Record<string,Record<string,AvailableBetDetail[]>> = {}; dataByTab['Player Props'].forEach(odd => { const btn=odd.bet_type?.name||"UnkProp";const pN=extractPlayerNameFromSelection(odd.selection_name,btn);if(!ppgbn[pN])ppgbn[pN]={};if(!ppgbn[pN][btn])ppgbn[pN][btn]=[];ppgbn[pN][btn].push(odd);}); contentByTab['Player Props']={}; for(const pN in ppgbn){const pM=[];for(const btn in ppgbn[pN])pM.push(processOddsForDisplay(ppgbn[pN][btn],btn));contentByTab['Player Props'][pN]=pM;}}
        if (dataByTab['All'].length > 0) contentByTab['All'] = groupOddsByBetTypeName(dataByTab['All']);
        if (dataByTab['Period Markets'].length > 0) contentByTab['Period Markets'] = groupOddsByBetTypeName(dataByTab['Period Markets']);
        return { tabOrder, contentByTab };
    }, [oddsData]);

    const renderOddButton = (odd: AvailableBetDetail | undefined, label?: string) => {
        if (!odd) return <div className="p-2.5 text-center text-xs text-gray-500 min-h-[50px] flex items-center justify-center">N/A</div>;
        const decimalOddForDisplay = americanToDecimal(odd.odds);
        return (<button key={odd.id} onClick={()=>handleOddSelectWrapper(odd)} disabled={isOddInBetSlip(odd.id)||!odd.is_active} className={`w-full p-2.5 text-left rounded focus:outline-none flex flex-col justify-center items-center group shadow text-center h-full ${isOddInBetSlip(odd.id)?'bg-sleeper-accent-dark text-white cursor-not-allowed':'bg-sleeper-tertiary hover:bg-sleeper-accent text-primary focus:ring-sleeper-accent-light'}`}><span className="text-xs font-medium group-hover:text-white mb-0.5">{label || odd.selection_name}</span><span className={`text-md font-bold ${isOddInBetSlip(odd.id)?'text-white':'text-sleeper-accent-light group-hover:text-white'}`}>{decimalOddForDisplay.toFixed(2)}</span></button>);
    };

    if (loading) return <div className="text-center py-10 text-xl text-sleeper-accent">Loading ...</div>;
    if (error) return <div className="text-center py-10 text-xl text-red-500">Error: {error}</div>;
    if (!game) return <div className="text-center py-10 text-xl">Game not found.</div>;
    const gameDate = new Date(game.game_time); const formattedDate = `${gameDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} - ${gameDate.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: true })}`; const isLive = game.status.toLowerCase().includes('live') || game.status.toLowerCase().includes('inplay'); const isFinal = game.status.toLowerCase().includes('final') || game.status.toLowerCase().includes('completed');

    return (
        <div className="container mx-auto px-2 sm:px-4 py-6 text-sleeper-text-primary">
            <Link to="/" className="inline-flex items-center mb-4 text-sleeper-accent hover:text-sleeper-accent-light"><ArrowLeftIcon className="h-5 w-5 mr-2" /> Back to Games</Link>
            <div className="bg-sleeper-secondary p-4 sm:p-6 rounded-lg shadow-xl mb-8"><div className="flex flex-col sm:flex-row justify-between items-center mb-2"><h1 className="text-2xl sm:text-3xl font-bold text-sleeper-text-primary truncate">{game.away_team} @ {game.home_team}</h1><span className="text-sm text-gray-400 mt-1 sm:mt-0">{formattedDate}</span></div><div className="text-center sm:text-right">{isFinal && game.home_score!=null && game.away_score!=null && (<p className="text-xl font-semibold text-sleeper-accent">Final: {game.away_team} {game.away_score} - {game.home_team} {game.home_score}</p>)}{isLive && <span className="px-3 py-1 text-sm font-semibold text-red-100 bg-red-600 rounded-full animate-pulse">LIVE</span>}{!isFinal && !isLive && <p className="text-md text-gray-400 capitalize">Status: {game.status}</p>}</div></div>
            {(!oddsData || processedTabsData.tabOrder.length === 0) && !loading ? (<p className="text-center text-lg text-gray-400 py-8">No active odds for this game.</p>) : (
                <Tab.Group>
                    <Tab.List className="flex space-x-1 rounded-xl bg-sleeper-secondary p-1 mb-4 overflow-x-auto">{processedTabsData.tabOrder.map((tabName) => (<Tab key={tabName} as={Fragment}>{({ selected }) => (<button className={`whitespace-nowrap rounded-lg py-2.5 px-4 text-sm font-medium leading-5 focus:outline-none ${selected ? 'bg-sleeper-primary text-white shadow' : 'text-sleeper-text-secondary hover:bg-sleeper-tertiary hover:text-sleeper-text-primary'}`}>{tabName}</button>)}</Tab>))}</Tab.List>
                    <Tab.Panels className="mt-2">
                        {processedTabsData.tabOrder.map((tabName) => (<Tab.Panel key={tabName} className="rounded-xl bg-sleeper-bg-secondary p-0 md:p-3 focus:outline-none space-y-4">
                            {tabName === 'Player Props' && Object.entries(processedTabsData.contentByTab[tabName] || {}).map(([playerName, marketsForPlayerUntyped]) => { const marketsForPlayer = marketsForPlayerUntyped as ProcessedMarket[]; return (
                                <Disclosure key={playerName} as="div" className="bg-sleeper-surface rounded-lg shadow-md" defaultOpen>{({open})=>(<>
                                    <Disclosure.Button className="flex justify-between w-full px-4 py-3 text-md font-semibold text-left text-sleeper-primary hover:bg-sleeper-tertiary rounded-t-lg"><span className="flex items-center"><UserCircleIcon className="h-5 w-5 mr-2 text-sleeper-accent"/>{playerName}</span><ChevronUpIcon className={`${open?'rotate-180':''} w-5 h-5 text-sleeper-accent`}/></Disclosure.Button>
                                    <Disclosure.Panel className="px-4 pt-3 pb-4 text-sm border-t border-sleeper-border space-y-4">
                                        {marketsForPlayer.map(market => (<div key={market.marketName} className="py-2"><h5 className="text-sm font-semibold text-sleeper-text-primary mb-2">{market.marketName}</h5>
                                            {market.lines.map((lineData,idx)=>(<div key={`${market.marketName}-line-${lineData.lineValue||idx}`} className="mb-2.5 p-2.5 bg-sleeper-bg-secondary/50 rounded-md">
                                                {lineData.lineValue!==null && lineData.lineValue!==undefined && !market.marketName.toLowerCase().includes("anytime") && !market.marketName.toLowerCase().includes("interception") && !market.marketName.toLowerCase().includes("yes/no") && !market.marketName.toLowerCase().includes("touchdown") && (<p className="text-xs text-sleeper-text-secondary mb-1.5">Line: {lineData.lineValue > 0 ? `+${lineData.lineValue}`:lineData.lineValue}</p>)}
                                                <div className="grid grid-cols-2 gap-2">
                                                    {renderOddButton(lineData.options.find(o=>o.selection_name.toLowerCase().includes('over')), "Over")}
                                                    {renderOddButton(lineData.options.find(o=>o.selection_name.toLowerCase().includes('under')), "Under")}
                                                    {renderOddButton(lineData.options.find(o=>o.selection_name.toLowerCase().includes('yes')), "Yes")}
                                                    {renderOddButton(lineData.options.find(o=>o.selection_name.toLowerCase().includes('no')), "No")}
                                                </div>
                                            </div>))}</div>))}
                                    </Disclosure.Panel></>)}</Disclosure>
                            )})}
                            {tabName === 'Game' && Object.entries(processedTabsData.contentByTab[tabName] || {}).map(([betTypeName, marketDataUntyped]) => { const market = marketDataUntyped as ProcessedMarket; return (<div key={betTypeName} className="p-4 bg-sleeper-surface rounded-lg shadow-md border border-sleeper-border">
                                <h4 className="text-md font-semibold text-sleeper-accent mb-3">{betTypeName}</h4> {/* Use market.marketName for base name? */}
                                {market.lines.map((lineData, idx) => (<div key={`${betTypeName}-line-${lineData.lineValue || idx}`} className="mb-2.5 last:mb-0 p-2.5 bg-sleeper-bg-secondary/50 rounded-md">
                                    {lineData.lineValue !== null && betTypeName !== 'Moneyline' && !betTypeName.toLowerCase().includes('even/odd') && !betTypeName.toLowerCase().includes('3-way') && !betTypeName.toLowerCase().includes('double chance') && (<p className="text-xs text-sleeper-text-secondary mb-1.5">Line: {lineData.lineValue > 0 ? `+${lineData.lineValue}`:lineData.lineValue}</p>)}
                                    <div className={`grid ${lineData.options.length === 3 ? 'grid-cols-3' : (lineData.options.length === 1 ? 'grid-cols-1' : 'grid-cols-2')} gap-2`}>
                                        {lineData.options.sort((a,b)=>{if(a.selection_name.toLowerCase().includes('over')||a.selection_name.toLowerCase().includes('yes'))return-1;if(b.selection_name.toLowerCase().includes('over')||b.selection_name.toLowerCase().includes('yes'))return 1;return a.selection_name.localeCompare(b.selection_name);}).map(odd=>renderOddButton(odd,odd.selection_name.replace(game.home_team,"Home").replace(game.away_team,"Away")))}
                                    </div>
                                </div>))}
                            </div>);})}
                            {(tabName === 'All Markets' || tabName === 'Period Markets') && Object.entries(processedTabsData.contentByTab[tabName] || {}).map(([betTypeName, oddsL]) => {const oddsList = oddsL as AvailableBetDetail[];return (<div key={betTypeName} className="p-3 bg-sleeper-surface rounded-md shadow-sm border border-sleeper-border"><h4 className="text-md font-semibold text-sleeper-accent mb-3">{betTypeName} ({(oddsList).length})</h4><div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">{(oddsList).sort((a,b)=>{if(a.selection_name.toLowerCase().includes('over')&&b.selection_name.toLowerCase().includes('under'))return-1;if(a.selection_name.toLowerCase().includes('under')&&b.selection_name.toLowerCase().includes('over'))return 1;if(a.line!=null&&b.line!=null&&a.line!==b.line)return(a.line||0)-(b.line||0);return a.selection_name.localeCompare(b.selection_name);}).map(odd=>{const dO=americanToDecimal(odd.odds);return(<button key={odd.id} onClick={()=>handleOddSelectWrapper(odd)} disabled={isOddInBetSlip(odd.id)||!odd.is_active}className={`w-full p-3 text-left rounded focus:outline-none flex justify-between items-center group shadow ${isOddInBetSlip(odd.id)?'bg-sleeper-accent-dark text-white cursor-not-allowed':'bg-sleeper-tertiary hover:bg-sleeper-accent text-primary focus:ring-sleeper-accent-light'}`}><span className="text-sm font-medium truncate group-hover:text-white">{odd.selection_name}</span><span className={`text-lg font-bold ${isOddInBetSlip(odd.id)?'text-white':'text-sleeper-accent-light group-hover:text-white'}`}>{dO.toFixed(2)}</span></button>);})}</div></div>)})}
                        </Tab.Panel>))}
                    </Tab.Panels>
                </Tab.Group>
            )}
        </div>
    );
}
export default GameDetailPage;