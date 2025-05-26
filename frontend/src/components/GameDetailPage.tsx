// frontend/src/components/GameDetailPage.tsx
import React, { useEffect, useState, useMemo, useCallback, Fragment } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { toast } from 'react-toastify';
import { Tab, Disclosure } from '@headlessui/react';
import { ChevronUpIcon, ArrowLeftIcon, UserCircleIcon, HomeIcon, UserGroupIcon as AwayTeamIcon } from '@heroicons/react/20/solid';
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
    game_info_for_slip: { id: number; api_game_id: string; home_team: string; away_team: string; game_time: string; };
    bet_subject_name?: string | null; bet_subject_team_id?: string | null; bet_subject_team_affiliation?: 'home' | 'away' | null;
}

// --- HELPER FUNCTIONS ---
const groupOddsByBetTypeName = (oddsList: AvailableBetDetail[]): Record<string, AvailableBetDetail[]> => {
    return oddsList.reduce((acc, odd) => { const key = odd.bet_type?.name || 'Other Bets'; if (!acc[key]) acc[key] = []; acc[key].push(odd); return acc; }, {} as Record<string, AvailableBetDetail[]>);
};
const extractPlayerNameFromSelection = (selectionName: string, betTypeName: string, fallbackPlayerName?: string | null ): string => {
    if (fallbackPlayerName && fallbackPlayerName.trim() !== "") return fallbackPlayerName; let name = selectionName.replace(/ (Over|Under) [\d.\-]+$/, '').replace(/ (Yes|No)$/i, '').trim(); const betTypeBase = betTypeName.replace(/^Player /i, '').replace(/ O\/U$/i, '').replace(/ Yes\/No$/i, '').trim(); if (name.toLowerCase().endsWith(betTypeBase.toLowerCase()) && betTypeBase.length > 0) { name = name.substring(0, name.length - betTypeBase.length).trim(); } else if (name.toLowerCase().startsWith(betTypeBase.toLowerCase()) && betTypeBase.length > 0) { name = name.substring(betTypeBase.length).trim(); } if (name === selectionName && (betTypeName.toLowerCase().includes("o/u") || betTypeName.toLowerCase().includes("yes/no")) ) { const parts = name.split(' '); if (parts.length > 2) { if (parts[0] && parts[1] && (parts[0].length > 1 || parts[1].length > 1)) { name = `${parts[0]} ${parts[1]}`; if (parts.length > 3 && parts[2] && (parts[2].length > 1 && !/^[A-Z]+$/.test(parts[2]) && !['Jr','Sr','II','III','IV'].includes(parts[2])) ) { name = `${parts[0]} ${parts[1]} ${parts[2]}`; }} else if (parts[0]) { name = parts[0];}} else if (parts.length === 2 && parts[0].length > 1 && parts[1].length > 1) { name = `${parts[0]} ${parts[1]}`; } else if (parts.length === 1 && parts[0].length > 1) { name = parts[0]; } else if (name === selectionName) { const commonPropWords = ["over", "under", "yes", "no", "longest", "receptions", "yards", "touchdowns", "attempts", "completions", "points", "made", "interceptions"]; let potentialPlayerName = selectionName; commonPropWords.forEach(word => { potentialPlayerName = potentialPlayerName.replace(new RegExp(` ${word}(\\s.*)?$`, 'i'), '').trim(); }); name = potentialPlayerName === selectionName ? "Unknown Player" : potentialPlayerName; }} return name.trim() || "Unknown Player";
};
interface ProcessedMarketLine { lineValue: number | null; options: AvailableBetDetail[]; }
interface ProcessedMarket { marketName: string; fullBetTypeName: string; lines: ProcessedMarketLine[]; }
const processOddsForMarketDisplay = (oddsListForSpecificMarket: AvailableBetDetail[], originalBetTypeName: string ): ProcessedMarket => {
    const baseMarketName = originalBetTypeName.replace(/^Player /i, '').replace(/ O\/U$/i, '').replace(/ Yes\/No$/i, '').replace(/ Even\/Odd$/i, '').trim(); const linesMap: Map<string, ProcessedMarketLine> = new Map(); oddsListForSpecificMarket.forEach(odd => { let lineKey = 'no_line_group'; const marketKeyLower = odd.bet_type.api_market_key.toLowerCase(); if (marketKeyLower.endsWith('_ou') || marketKeyLower.includes('spreads')) { lineKey = (odd.line === null || odd.line === undefined) ? 'null_line_for_ou_spread' : String(odd.line); } if (!linesMap.has(lineKey)) { linesMap.set(lineKey, { lineValue: odd.line, options: [] }); } linesMap.get(lineKey)!.options.push(odd); }); return { marketName: baseMarketName, fullBetTypeName: originalBetTypeName, lines: Array.from(linesMap.values()) };
};

// --- GameDetailPage Component ---
const GameDetailPage: React.FC = () => {
    const { dbGameId } = useParams<{ dbGameId: string }>();
    const [game, setGame] = useState<Game | null>(null);
    const [oddsData, setOddsData] = useState<AvailableBetDetail[] | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const { addToBetSlip, removeFromBetSlip, isOddInBetSlip } = useDashboardOutletContext();

    const fetchGameDetailsAndOdds = useCallback(async () => {
        if (!dbGameId) { setError("Game ID missing."); setLoading(false); return; }
        const gameIdNumber = parseInt(dbGameId, 10);
        if (isNaN(gameIdNumber)) { setError("Invalid Game ID."); setLoading(false); return; }
        setLoading(true); setError(null);
        try {
            const { data: gameDetails, error: gameError } = await supabase.from('games').select('*').eq('id', gameIdNumber).single();
            if (gameError) throw gameError; if (!gameDetails) throw new Error('Game not found.');
            setGame(gameDetails as Game);
            const { data: fetchedOdds, error: oddsError } = await supabase.from('available_bets').select(`*, bet_type:bet_types!inner(id, name, api_market_key, description), bet_subject_name, bet_subject_team_id, bet_subject_team_affiliation`).eq('game_id', gameDetails.id).eq('is_active', true).order('bet_type_id').order('line', { ascending: true, nullsFirst: true }).order('selection_name');
            if (oddsError) throw oddsError;
            const oddsWithCtx = fetchedOdds?.map(o=>({...o, game_info_for_slip:{id:gameDetails.id,api_game_id:gameDetails.api_game_id,home_team:gameDetails.home_team,away_team:gameDetails.away_team,game_time:gameDetails.game_time}}))||[];
            setOddsData(oddsWithCtx as AvailableBetDetail[]);
        } catch (err:any) { console.error('Err GameDetailFetch:', err); setError(err.message); toast.error(`Load err: ${err.message}`);}
        finally { setLoading(false); }
    }, [dbGameId]);
    useEffect(() => { fetchGameDetailsAndOdds(); }, [fetchGameDetailsAndOdds]);

    const handleOddClick = (odd: AvailableBetDetail) => {
        if (!odd.is_active && !isOddInBetSlip(odd.id)) { toast.warn('This betting option is no longer active.'); return; }
        if (isOddInBetSlip(odd.id)) { removeFromBetSlip(odd.id); }
        else { addToBetSlip(odd, false); }
    };

    const processedTabsData = useMemo(() => {
        if (!oddsData || !game) return { tabOrder: [], contentByTab: {} };
        const dataByTab: Record<string, AvailableBetDetail[]> = { 'Game Bets': [], 'Player Bets': [] };
        const periodKeysPattern = /^(1q_|2q_|1h_|3q_|4q_|2h_)/i;
        oddsData.forEach(odd => { const marketKey = odd.bet_type?.api_market_key?.toLowerCase() || 'unknown'; if (marketKey.startsWith('player_')) dataByTab['Player Bets'].push(odd); else if (!periodKeysPattern.test(marketKey)) dataByTab['Game Bets'].push(odd); });
        const tabOrder = ['Game Bets', 'Player Bets'].filter(name => dataByTab[name]?.length > 0);
        const contentByTab: Record<string, any> = {};
        if (dataByTab['Game Bets']?.length > 0) { const gmgbt = groupOddsByBetTypeName(dataByTab['Game Bets']); contentByTab['Game Bets'] = []; for (const btn in gmgbt) contentByTab['Game Bets'].push(processOddsForMarketDisplay(gmgbt[btn], btn));} // Store as array of ProcessedMarket
        if (dataByTab['Player Bets']?.length > 0) {
            const ppat: { home: AvailableBetDetail[], away: AvailableBetDetail[], unknown: AvailableBetDetail[] } = { home: [], away: [], unknown: [] };
            dataByTab['Player Bets'].forEach(odd => { if (odd.bet_subject_team_affiliation === 'home') ppat.home.push(odd); else if (odd.bet_subject_team_affiliation === 'away') ppat.away.push(odd); else ppat.unknown.push(odd); });
            contentByTab['Player Bets'] = { homePlayers: {}, awayPlayers: {}, unknownPlayers: {} };
            const processPg = (pOds:AvailableBetDetail[]) => { const gbn:Record<string,Record<string,AvailableBetDetail[]>>={}; pOds.forEach(o=>{const btn=o.bet_type?.name||"UnkProp";const pN=o.bet_subject_name||extractPlayerNameFromSelection(o.selection_name,btn,o.bet_subject_name);if(!gbn[pN])gbn[pN]={};if(!gbn[pN][btn])gbn[pN][btn]=[];gbn[pN][btn].push(o);});const fpPd:Record<string,ProcessedMarket[]>={};for(const pN in gbn){const pM:ProcessedMarket[]=[];for(const btn in gbn[pN])pM.push(processOddsForMarketDisplay(gbn[pN][btn],btn));fpPd[pN]=pM;}return fpPd;};
            if (ppat.home.length > 0) contentByTab['Player Bets'].homePlayers = processPg(ppat.home);
            if (ppat.away.length > 0) contentByTab['Player Bets'].awayPlayers = processPg(ppat.away);
            if (ppat.unknown.length > 0) contentByTab['Player Bets'].unknownPlayers = processPg(ppat.unknown);
        }
        return { tabOrder, contentByTab };
    }, [oddsData, game]);

    const renderOddButton = (odd: AvailableBetDetail | undefined, label?: string) => {
        if (!odd) return <div className="w-full min-h-[50px] bg-sleeper-tertiary/20 rounded-md"></div>;
        const decimalOddForDisplay = americanToDecimal(odd.odds);
        const isSelected = isOddInBetSlip(odd.id);
        return (<button key={odd.id + (label || '')} onClick={()=>handleOddClick(odd)} disabled={!odd.is_active && !isSelected} className={`w-full p-2.5 text-left rounded focus:outline-none flex flex-col justify-center items-center group shadow text-center h-full transition-all duration-150 ease-in-out ${isSelected?'bg-sleeper-accent text-white ring-2 ring-white/80':'bg-sleeper-tertiary hover:bg-sleeper-accent hover:text-white text-sleeper-text-primary focus:ring-2 focus:ring-sleeper-accent-light'} ${!odd.is_active && !isSelected ? 'opacity-50 cursor-not-allowed' : ''}`}><span className="text-xs font-medium group-hover:text-white mb-0.5">{label || odd.selection_name}</span><span className={`text-md font-bold ${isSelected?'text-white':'text-sleeper-accent-light group-hover:text-white'}`}>{decimalOddForDisplay.toFixed(2)}</span></button>);
    };

    if (loading) return <div className="text-center py-10 text-xl text-sleeper-accent">Loading ...</div>;
    if (error) return <div className="text-center py-10 text-xl text-red-500">Error: {error}</div>;
    if (!game) return <div className="text-center py-10 text-xl">Game not found.</div>;
    const gameDate = new Date(game.game_time); const formattedDate = `${gameDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} - ${gameDate.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: true })}`; const isLive = game.status.toLowerCase().includes('live') || game.status.toLowerCase().includes('inplay'); const isFinal = game.status.toLowerCase().includes('final') || game.status.toLowerCase().includes('completed');

    return (
        <div className="container mx-auto px-2 sm:px-4 py-6 text-sleeper-text-primary">
            <Link to="/" className="inline-flex items-center mb-4 text-sleeper-accent hover:text-sleeper-accent-light"><ArrowLeftIcon className="h-5 w-5 mr-2" /> Back to Games</Link>
            <div className="bg-sleeper-surface-100 p-4 sm:p-6 rounded-lg shadow-xl mb-8"><div className="flex flex-col sm:flex-row justify-between items-center mb-2"><h1 className="text-2xl sm:text-3xl font-bold text-sleeper-text-primary truncate">{game.away_team} @ {game.home_team}</h1><span className="text-sm text-sleeper-text-secondary mt-1 sm:mt-0">{formattedDate}</span></div><div className="text-center sm:text-right">{isFinal && game.home_score!=null && game.away_score!=null && (<p className="text-xl font-semibold text-sleeper-accent">Final: {game.away_team} {game.away_score} - {game.home_team} {game.home_score}</p>)}{isLive && <span className="px-3 py-1 text-sm font-semibold text-red-100 bg-red-600 rounded-full animate-pulse">LIVE</span>}{!isFinal && !isLive && <p className="text-md text-sleeper-text-secondary capitalize">Status: {game.status}</p>}</div></div>

            {(!oddsData || processedTabsData.tabOrder.length === 0) && !loading ? (<p className="text-center text-lg text-gray-400 py-8">No active odds for this game.</p>) : (
                <Tab.Group>
                    <Tab.List className="flex space-x-1 rounded-xl bg-sleeper-surface-100 p-1 mb-6 shadow">{processedTabsData.tabOrder.map((tabName) => (<Tab key={tabName} as={Fragment}>{({ selected }) => (<button className={`w-full whitespace-nowrap rounded-lg py-2.5 px-4 text-sm font-medium leading-5 focus:outline-none transition-all ${selected ? 'bg-sleeper-primary text-sleeper-text-on-primary shadow-lg' : 'text-sleeper-text-secondary hover:bg-sleeper-surface-200 hover:text-sleeper-text-primary'}`}>{tabName}</button>)}</Tab>))}</Tab.List>
                    <Tab.Panels className="mt-2">
                        {processedTabsData.tabOrder.map((tabName) => (
                            <Tab.Panel key={tabName} className="rounded-xl bg-transparent focus:outline-none space-y-4">
                                {tabName === 'Player Bets' &&
                                    ['homePlayers', 'awayPlayers', 'unknownPlayers'].map(playerGroupKey => {
                                        const isHome = playerGroupKey === 'homePlayers';
                                        const groupTitle = isHome ? `${game.home_team} Players` : playerGroupKey === 'awayPlayers' ? `${game.away_team} Players` : "Other Players";
                                        const icon = isHome ? HomeIcon : playerGroupKey === 'awayPlayers' ? AwayTeamIcon : UserCircleIcon;
                                        const playersToRender = processedTabsData.contentByTab[tabName]?.[playerGroupKey] as Record<string, ProcessedMarket[]> | undefined;

                                        if (!playersToRender || Object.keys(playersToRender).length === 0) return null;

                                        return (
                                            <Disclosure key={playerGroupKey} as="div" className="mb-4 bg-sleeper-surface-100 rounded-lg shadow-md" defaultOpen={playerGroupKey === 'homePlayers' || playerGroupKey === 'awayPlayers'}>
                                                {({open})=>(<>
                                                    <Disclosure.Button className="flex justify-between w-full px-4 py-3 text-lg font-semibold text-left text-sleeper-primary hover:bg-sleeper-surface-200/80 rounded-lg">
                                                        <span className="flex items-center">{React.createElement(icon, {className: "h-6 w-6 mr-3 text-sleeper-primary"})} {groupTitle}</span>
                                                        <ChevronUpIcon className={`${open?'rotate-180':''} w-5 h-5 text-sleeper-primary`}/>
                                                    </Disclosure.Button>
                                                    <Disclosure.Panel className="px-2 py-3 text-sm border-t border-sleeper-border space-y-3">
                                                        {Object.entries(playersToRender).map(([playerName, marketsForPlayer]) => (
                                                            <Disclosure key={`${playerName}-${playerGroupKey}`} as="div" className="bg-sleeper-surface-200 rounded-md shadow-sm" defaultOpen={false}>
                                                                {({open: playerOpen})=>(<>
                                                                    <Disclosure.Button className="flex justify-between w-full px-3 py-2.5 text-md font-medium text-left text-sleeper-text-primary hover:bg-sleeper-border/20 rounded-t-md">
                                                                        <span className="flex items-center"><UserCircleIcon className="h-5 w-5 mr-2 text-sleeper-interactive"/>{playerName}</span>
                                                                        <ChevronUpIcon className={`${playerOpen?'rotate-180':''} w-5 h-5 text-sleeper-interactive`}/>
                                                                    </Disclosure.Button>
                                                                    <Disclosure.Panel className="px-3 pt-2 pb-3 text-xs border-t border-sleeper-border/50 space-y-3">
                                                                        {marketsForPlayer.map(market => (
                                                                            <div key={market.fullBetTypeName +'-'+ market.marketName} className="py-1">
                                                                                <h5 className="text-xs font-semibold text-sleeper-text-secondary mb-1.5 uppercase tracking-wider">{market.marketName}</h5>
                                                                                {market.lines.map((lineData,idx)=>(
                                                                                    <div key={`${market.marketName}-L${lineData.lineValue !== null ? lineData.lineValue : 'noLine'}-${idx}`} className="mb-2 p-2.5 bg-sleeper-surface-100/70 rounded-md">
                                                                                        {(lineData.lineValue!==null && lineData.lineValue!==undefined && market.fullBetTypeName.toLowerCase().includes("o/u")) && (
                                                                                            <p className="text-xs text-sleeper-text-secondary mb-1.5">Line: {lineData.lineValue > 0 ? `+${lineData.lineValue.toFixed(1)}` : lineData.lineValue.toFixed(1)}</p>
                                                                                        )}
                                                                                        <div className="grid grid-cols-2 gap-2">
                                                                                            {market.fullBetTypeName.toLowerCase().includes("o/u") ? (<>
                                                                                                    {renderOddButton(lineData.options.find(o=>o.selection_name.toLowerCase().includes('over')), "Over")}
                                                                                                    {renderOddButton(lineData.options.find(o=>o.selection_name.toLowerCase().includes('under')), "Under")}
                                                                                                </>)
                                                                                                : market.fullBetTypeName.toLowerCase().includes("yes/no") ? (<>
                                                                                                        {renderOddButton(lineData.options.find(o=>o.selection_name.toLowerCase().includes('yes')), "Yes")}
                                                                                                        {renderOddButton(lineData.options.find(o=>o.selection_name.toLowerCase().includes('no')), "No")}
                                                                                                    </>)
                                                                                                    : lineData.options.map(odd => renderOddButton(odd, odd.selection_name.replace(playerName, '').trim()))
                                                                                            }
                                                                                        </div>
                                                                                    </div>
                                                                                ))}
                                                                            </div>
                                                                        ))}
                                                                    </Disclosure.Panel>
                                                                </>)}
                                                            </Disclosure>
                                                        ))}
                                                    </Disclosure.Panel>
                                                </>)}
                                            </Disclosure>
                                        );
                                    })
                                }
                                {tabName === 'Game Bets' &&
                                    (processedTabsData.contentByTab[tabName] as ProcessedMarket[] || []).map((market, marketIdx) => (
                                        <div key={market.fullBetTypeName + marketIdx} className="p-4 bg-sleeper-surface-100 rounded-lg shadow-md border border-sleeper-border">
                                            <h4 className="text-md font-semibold text-sleeper-primary mb-3">{market.fullBetTypeName}</h4>
                                            {market.lines.map((lineData, lineIdx) => (
                                                <div key={`${market.fullBetTypeName}-L${lineData.lineValue !== null ? lineData.lineValue : 'noLine'}-${lineIdx}`} className="mb-2.5 last:mb-0 p-2.5 bg-sleeper-surface-200 rounded-md">
                                                    {lineData.lineValue !== null && market.fullBetTypeName !== 'Moneyline' && !market.fullBetTypeName.toLowerCase().includes('even/odd') && !market.fullBetTypeName.toLowerCase().includes('3-way') && !market.fullBetTypeName.toLowerCase().includes('double chance') && (
                                                        <p className="text-xs text-sleeper-text-secondary mb-1.5">Line: {lineData.lineValue > 0 ? `+${lineData.lineValue.toFixed(1)}`:lineData.lineValue.toFixed(1)}</p>
                                                    )}
                                                    <div className={`grid ${lineData.options.length === 3 ? 'grid-cols-3' : (lineData.options.length === 1 ? 'grid-cols-1' : 'grid-cols-2')} gap-2`}>
                                                        {lineData.options.sort((a,b)=>{if(a.selection_name.toLowerCase().includes('over')||a.selection_name.toLowerCase().includes('yes'))return-1;if(b.selection_name.toLowerCase().includes('over')||b.selection_name.toLowerCase().includes('yes'))return 1; if (game && a.selection_name === game.home_team) return -1; if (game && b.selection_name === game.home_team) return 1; return a.selection_name.localeCompare(b.selection_name);}).map(odd=>renderOddButton(odd,odd.selection_name))}
                                                    </div>
                                                </div>))}
                                        </div>
                                    ))}
                            </Tab.Panel>
                        ))}
                    </Tab.Panels>
                </Tab.Group>
            )}
        </div>
    );
}
export default GameDetailPage;