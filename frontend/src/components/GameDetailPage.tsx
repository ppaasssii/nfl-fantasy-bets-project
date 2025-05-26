// frontend/src/components/GameDetailPage.tsx
import React, { useEffect, useState, useMemo, useCallback, Fragment } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { toast } from 'react-toastify';
import { Tab, Disclosure } from '@headlessui/react';
import { ChevronUpIcon, ArrowLeftIcon, UserCircleIcon, HomeIcon, UserGroupIcon as AwayTeamIcon } from '@heroicons/react/20/solid';
import { useDashboardOutletContext } from '../App';
import { americanToDecimal } from '../utils/oddsConverter';

// --- Types (Remain the same) ---
interface Game { id: number; api_game_id: string; home_team: string; away_team: string; game_time: string; status: string; home_score?: number | null; away_score?: number | null; }
interface BetTypeInterface { id: number; name: string; api_market_key: string; description?: string; }
export interface AvailableBetDetail { id: number; game_id: number; bet_type_id: number; selection_name: string; odds: number; line?: number | null; is_active: boolean; is_winning_outcome?: boolean | null; source_bookmaker?: string | null; api_last_update?: string | null; bet_type: Pick<BetTypeInterface, 'id' | 'name' | 'api_market_key' | 'description'>; game_info_for_slip: { id: number; api_game_id: string; home_team: string; away_team: string; game_time: string; }; bet_subject_name?: string | null; bet_subject_team_id?: string | null; bet_subject_team_affiliation?: 'home' | 'away' | null; }

// --- HELPER FUNCTIONS (Remain the same) ---
const groupOddsByBetTypeName = (oddsList: AvailableBetDetail[]): Record<string, AvailableBetDetail[]> => oddsList.reduce((acc, odd) => { const key = odd.bet_type?.name || 'Other Bets'; if (!acc[key]) acc[key] = []; acc[key].push(odd); return acc; }, {} as Record<string, AvailableBetDetail[]>);
const extractPlayerNameFromSelection = (selectionName: string, betTypeName: string, fallbackPlayerName?: string | null ): string => { if (fallbackPlayerName && fallbackPlayerName.trim() !== "") return fallbackPlayerName; let name = selectionName.replace(/ (Over|Under) [\d.\-]+$/, '').replace(/ (Yes|No)$/i, '').trim(); const betTypeBase = betTypeName.replace(/^Player /i, '').replace(/ O\/U$/i, '').replace(/ Yes\/No$/i, '').trim(); if (name.toLowerCase().endsWith(betTypeBase.toLowerCase()) && betTypeBase.length > 0) { name = name.substring(0, name.length - betTypeBase.length).trim(); } else if (name.toLowerCase().startsWith(betTypeBase.toLowerCase()) && betTypeBase.length > 0) { name = name.substring(betTypeBase.length).trim(); } if (name === selectionName && (betTypeName.toLowerCase().includes("o/u") || betTypeName.toLowerCase().includes("yes/no")) ) { const parts = name.split(' '); if (parts.length > 2) { if (parts[0] && parts[1] && (parts[0].length > 1 || parts[1].length > 1)) { name = `${parts[0]} ${parts[1]}`; if (parts.length > 3 && parts[2] && (parts[2].length > 1 && !/^[A-Z]+$/.test(parts[2]) && !['Jr','Sr','II','III','IV'].includes(parts[2])) ) { name = `${parts[0]} ${parts[1]} ${parts[2]}`; }} else if (parts[0]) { name = parts[0];}} else if (parts.length === 2 && parts[0].length > 1 && parts[1].length > 1) { name = `${parts[0]} ${parts[1]}`; } else if (parts.length === 1 && parts[0].length > 1) { name = parts[0]; } else if (name === selectionName) { const commonPropWords = ["over", "under", "yes", "no", "longest", "receptions", "yards", "touchdowns", "attempts", "completions", "points", "made", "interceptions"]; let potentialPlayerName = selectionName; commonPropWords.forEach(word => { potentialPlayerName = potentialPlayerName.replace(new RegExp(` ${word}(\\s.*)?$`, 'i'), '').trim(); }); name = potentialPlayerName === selectionName ? "Unknown Player" : potentialPlayerName; }} return name.trim() || "Unknown Player"; };
interface ProcessedMarketLine { lineValue: number | null; options: AvailableBetDetail[]; }
interface ProcessedMarket { marketName: string; fullBetTypeName: string; lines: ProcessedMarketLine[]; }
const processOddsForMarketDisplay = (oddsListForSpecificMarket: AvailableBetDetail[], originalBetTypeName: string ): ProcessedMarket => { const baseMarketName = originalBetTypeName.replace(/^Player /i, '').replace(/ O\/U$/i, '').replace(/ Yes\/No$/i, '').replace(/ Even\/Odd$/i, '').trim(); const linesMap: Map<string, ProcessedMarketLine> = new Map(); oddsListForSpecificMarket.forEach(odd => { let lineKey = 'no_line_group'; const marketKeyLower = odd.bet_type.api_market_key.toLowerCase(); if (marketKeyLower.endsWith('_ou') || marketKeyLower.includes('spreads')) { lineKey = (odd.line === null || odd.line === undefined) ? 'null_line_for_ou_spread' : String(odd.line); } if (!linesMap.has(lineKey)) { linesMap.set(lineKey, { lineValue: odd.line, options: [] }); } linesMap.get(lineKey)!.options.push(odd); }); return { marketName: baseMarketName, fullBetTypeName: originalBetTypeName, lines: Array.from(linesMap.values()) }; };

const GameDetailPage: React.FC = () => {
    const { dbGameId } = useParams<{ dbGameId: string }>();
    const [game, setGame] = useState<Game | null>(null);
    const [oddsData, setOddsData] = useState<AvailableBetDetail[] | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const { addToBetSlip, removeFromBetSlip, isOddInBetSlip } = useDashboardOutletContext();

    const fetchGameDetailsAndOdds = useCallback(async () => { /* ... same fetching logic ... */
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

    const handleOddClick = (odd: AvailableBetDetail) => { /* ... same toggle logic ... */
        if (!odd.is_active && !isOddInBetSlip(odd.id)) { toast.warn('This betting option is no longer active.'); return; }
        if (isOddInBetSlip(odd.id)) { removeFromBetSlip(odd.id); } else { addToBetSlip(odd, false); }
    };

    const processedTabsData = useMemo(() => { /* ... same processing logic ... */
        if (!oddsData || !game) return { tabOrder: [], contentByTab: {} };
        const dataByTab: Record<string, AvailableBetDetail[]> = { 'Game Bets': [], 'Player Bets': [] }; const periodKeysPattern = /^(1q_|2q_|1h_|3q_|4q_|2h_)/i; oddsData.forEach(odd => { const marketKey = odd.bet_type?.api_market_key?.toLowerCase() || 'unknown'; if (marketKey.startsWith('player_')) dataByTab['Player Bets'].push(odd); else if (!periodKeysPattern.test(marketKey)) dataByTab['Game Bets'].push(odd); }); const tabOrder = ['Game Bets', 'Player Bets'].filter(name => dataByTab[name]?.length > 0); const contentByTab: Record<string, any> = {}; if (dataByTab['Game Bets']?.length > 0) { const gmgbt = groupOddsByBetTypeName(dataByTab['Game Bets']); const pGML:ProcessedMarket[]=[]; for (const btn in gmgbt)pGML.push(processOddsForMarketDisplay(gmgbt[btn],btn)); contentByTab['Game Bets']=pGML;} if (dataByTab['Player Bets']?.length > 0) { const ppat: { home: AvailableBetDetail[], away: AvailableBetDetail[], unknown: AvailableBetDetail[] } = { home: [], away: [], unknown: [] }; dataByTab['Player Bets'].forEach(odd => { if (odd.bet_subject_team_affiliation === 'home') ppat.home.push(odd); else if (odd.bet_subject_team_affiliation === 'away') ppat.away.push(odd); else ppat.unknown.push(odd); }); contentByTab['Player Bets'] = { homePlayers: {}, awayPlayers: {}, unknownPlayers: {} }; const processPg = (pOds:AvailableBetDetail[]) => { const gbn:Record<string,Record<string,AvailableBetDetail[]>>={}; pOds.forEach(o=>{const btn=o.bet_type?.name||"UnkProp";const pN=o.bet_subject_name||extractPlayerNameFromSelection(o.selection_name,btn,o.bet_subject_name);if(!gbn[pN])gbn[pN]={};if(!gbn[pN][btn])gbn[pN][btn]=[];gbn[pN][btn].push(o);});const fpPd:Record<string,ProcessedMarket[]>={};for(const pN in gbn){const pM:ProcessedMarket[]=[];for(const btn in gbn[pN])pM.push(processOddsForMarketDisplay(gbn[pN][btn],btn));fpPd[pN]=pM;}return fpPd;}; if (ppat.home.length > 0) contentByTab['Player Bets'].homePlayers = processPg(ppat.home); if (ppat.away.length > 0) contentByTab['Player Bets'].awayPlayers = processPg(ppat.away); if (ppat.unknown.length > 0 && Object.keys(ppat.unknown).length > 0) contentByTab['Player Bets'].unknownPlayers = processPg(ppat.unknown); } return { tabOrder, contentByTab };
    }, [oddsData, game]);

    const renderOddButton = (odd: AvailableBetDetail | undefined, label?: string) => { /* ... same button styling and logic from previous, uses sleeper theme classes ... */
        if (!odd) return <div className="w-full min-h-[56px] bg-sleeper-surface-200/30 rounded-md"></div>; // Adjusted bg
        const decimalOddForDisplay = americanToDecimal(odd.odds);
        const isSelected = isOddInBetSlip(odd.id);
        return (<button key={odd.id + (label || '') + '-detail-odd-btn'} onClick={()=>handleOddClick(odd)} disabled={!odd.is_active && !isSelected} className={`w-full p-3 text-left rounded-md focus:outline-none flex flex-col justify-center items-center group shadow-md h-full transition-all duration-150 ease-in-out ${isSelected?'bg-sleeper-accent text-sleeper-text-on-accent ring-1 ring-white/50':'bg-sleeper-surface-200 hover:bg-sleeper-primary focus:ring-2 focus:ring-sleeper-primary'} ${!odd.is_active && !isSelected ? 'bg-sleeper-surface-100 text-gray-500 cursor-not-allowed opacity-60' : ''}`}><span className={`text-xs font-medium mb-0.5 ${isSelected ? 'text-sleeper-text-on-accent' : 'text-sleeper-text-secondary group-hover:text-sleeper-text-on-primary'}`}>{label || odd.selection_name}</span><span className={`text-md font-bold ${isSelected?'text-sleeper-text-on-accent':'text-sleeper-interactive group-hover:text-sleeper-text-on-primary'}`}>{decimalOddForDisplay.toFixed(2)}</span></button>);
    };

    if (loading) return <div className="text-center py-10 text-xl text-sleeper-accent animate-pulse">Loading Game Details...</div>;
    if (error) return <div className="flex flex-col items-center justify-center text-center py-10 bg-sleeper-surface-100 rounded-lg shadow-md border border-sleeper-error"><ExclamationTriangleIcon className="w-12 h-12 text-sleeper-error mb-3" /><h3 className="text-xl text-sleeper-error mb-2">Error Loading Game Data</h3><p className="text-sleeper-text-secondary">{error}</p></div>;
    if (!game) return <div className="flex flex-col items-center justify-center text-center py-10 bg-sleeper-surface-100 rounded-lg shadow-md border border-sleeper-border"><CalendarDaysIcon className="w-12 h-12 text-sleeper-text-secondary mb-3 opacity-50" /><h3 className="text-xl text-sleeper-text-primary">Game Not Found</h3><p className="text-sleeper-text-secondary">The requested game could not be found.</p></div>;

    const gameDate = new Date(game.game_time); const formattedDate = `${gameDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} - ${gameDate.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: true })}`; const isLive = game.status.toLowerCase().includes('live') || game.status.toLowerCase().includes('inplay'); const isFinal = game.status.toLowerCase().includes('final') || game.status.toLowerCase().includes('completed');

    return (
        <div className="container mx-auto px-2 sm:px-4 py-6"> {/* text-sleeper-text-primary applied by body */}
            <Link to="/" className="inline-flex items-center mb-6 text-sm text-sleeper-interactive hover:text-sleeper-primary transition-colors font-medium"><ArrowLeftIcon className="h-5 w-5 mr-1.5" /> Back to Games</Link>

            {/* Game Header */}
            <div className="bg-sleeper-surface-100 p-4 sm:p-6 rounded-xl shadow-xl mb-8 border border-sleeper-border">
                <div className="flex flex-col sm:flex-row justify-between items-center mb-2">
                    <h1 className="text-2xl sm:text-3xl font-bold text-sleeper-text-primary truncate text-center sm:text-left">{game.away_team} <span className="text-sleeper-text-secondary mx-1 text-xl">@</span> {game.home_team}</h1>
                    <div className="text-sm text-sleeper-text-secondary mt-2 sm:mt-0 text-center sm:text-right">
                        <div>{formattedDate}</div>
                        <div className="capitalize mt-0.5">{isLive ? <span className="px-2 py-0.5 text-xs font-bold text-white bg-red-600 rounded-full animate-pulse">LIVE</span> : game.status}</div>
                    </div>
                </div>
                {isFinal && game.home_score!=null && game.away_score!=null && (
                    <p className="text-xl text-center sm:text-right font-semibold text-sleeper-primary mt-2">Final Score: {game.away_team} <span className="text-sleeper-accent">{game.away_score}</span> - {game.home_team} <span className="text-sleeper-accent">{game.home_score}</span></p>
                )}
            </div>

            {(!oddsData || processedTabsData.tabOrder.length === 0) && !loading ? (
                <div className="text-center text-lg text-sleeper-text-secondary py-10 bg-sleeper-surface-100 rounded-lg shadow-md border border-sleeper-border">No active odds available for this game at the moment.</div>
            ) : (
                <Tab.Group>
                    <Tab.List className="flex space-x-1 rounded-xl bg-sleeper-surface-100 p-1.5 mb-6 shadow-md border border-sleeper-border overflow-x-auto custom-scrollbar">
                        {processedTabsData.tabOrder.map((tabName) => (
                            <Tab key={tabName} as={Fragment}>
                                {({ selected }) => (<button className={`flex-auto whitespace-nowrap rounded-lg py-2.5 px-3 sm:px-5 text-sm font-semibold leading-5 focus:outline-none transition-all duration-150 ease-in-out ${selected ? 'bg-sleeper-primary text-sleeper-text-on-primary shadow-lg' : 'text-sleeper-text-secondary hover:bg-sleeper-surface-200 hover:text-sleeper-text-primary'}`}>{tabName}</button>)}
                            </Tab>
                        ))}
                    </Tab.List>
                    <Tab.Panels className="mt-2">
                        {processedTabsData.tabOrder.map((tabName) => (
                            <Tab.Panel key={tabName} className="focus:outline-none space-y-6"> {/* Removed rounded-xl bg-transparent */}

                                {/* Player Bets Tab Rendering */}
                                {tabName === 'Player Bets' && ['homePlayers', 'awayPlayers', 'unknownPlayers'].map(playerGroupKey => {
                                    const isHome = playerGroupKey === 'homePlayers';
                                    const groupTitle = isHome ? `${game.home_team} Players` : playerGroupKey === 'awayPlayers' ? `${game.away_team} Players` : "Other Players";
                                    const icon = isHome ? HomeIcon : playerGroupKey === 'awayPlayers' ? AwayTeamIcon : UserCircleIcon;
                                    const playersToRender = processedTabsData.contentByTab[tabName]?.[playerGroupKey] as Record<string, ProcessedMarket[]> | undefined;
                                    if (!playersToRender || Object.keys(playersToRender).length === 0) return null;

                                    return ( <Disclosure key={playerGroupKey} as="div" className="bg-sleeper-surface-100 rounded-lg shadow-lg border border-sleeper-border" defaultOpen={true}>
                                        {({open})=>(<>
                                            <Disclosure.Button className={`flex justify-between w-full px-4 py-3 text-lg font-semibold text-left text-sleeper-text-primary hover:bg-sleeper-surface-200/70 ${open ? 'rounded-t-lg' : 'rounded-lg'}`}>
                                                <span className="flex items-center">{React.createElement(icon, {className: "h-6 w-6 mr-3 text-sleeper-primary"})} {groupTitle}</span>
                                                <ChevronUpIcon className={`${open?'rotate-180':''} w-6 h-6 text-sleeper-primary`}/>
                                            </Disclosure.Button>
                                            <Disclosure.Panel className="px-3 py-3 text-sm border-t border-sleeper-border space-y-4">
                                                {Object.entries(playersToRender).map(([playerName, marketsForPlayer]) => (
                                                    <Disclosure key={`${playerName}-${playerGroupKey}`} as="div" className="bg-sleeper-surface-200 rounded-md shadow-md" defaultOpen={false}>
                                                        {({open: playerOpen})=>(<>
                                                            <Disclosure.Button className={`flex justify-between w-full px-4 py-2.5 text-md font-medium text-left text-sleeper-text-primary hover:bg-sleeper-border/20 ${playerOpen ? 'rounded-t-md' : 'rounded-md'}`}>
                                                                <span className="flex items-center"><UserCircleIcon className="h-5 w-5 mr-2 text-sleeper-interactive"/>{playerName}</span>
                                                                <ChevronUpIcon className={`${playerOpen?'rotate-180':''} w-5 h-5 text-sleeper-interactive`}/>
                                                            </Disclosure.Button>
                                                            <Disclosure.Panel className="px-3 pt-3 pb-3 text-xs border-t border-sleeper-border/50 space-y-3">
                                                                {marketsForPlayer.map(market => (<div key={market.fullBetTypeName +'-'+ market.marketName} className="py-1.5">
                                                                    <h5 className="text-sm font-semibold text-sleeper-text-secondary mb-2">{market.marketName}</h5>
                                                                    {market.lines.map((lineData,idx)=>(<div key={`${market.marketName}-L${lineData.lineValue !== null ? lineData.lineValue : 'noLine'}-${idx}`} className="mb-2 p-3 bg-sleeper-surface-100 rounded-md border border-sleeper-border/30">
                                                                        {(lineData.lineValue!==null&&lineData.lineValue!==undefined&&market.fullBetTypeName.toLowerCase().includes("o/u"))&&(<p className="text-xs text-sleeper-text-secondary mb-1.5">Line: {lineData.lineValue > 0 ? `+${lineData.lineValue.toFixed(1)}` : lineData.lineValue.toFixed(1)}</p>)}
                                                                        <div className="grid grid-cols-2 gap-2.5">
                                                                            {market.fullBetTypeName.toLowerCase().includes("o/u")?(<> {renderOddButton(lineData.options.find(o=>o.selection_name.toLowerCase().includes('over')), "Over")} {renderOddButton(lineData.options.find(o=>o.selection_name.toLowerCase().includes('under')), "Under")} </>)
                                                                                : market.fullBetTypeName.toLowerCase().includes("yes/no")?(<> {renderOddButton(lineData.options.find(o=>o.selection_name.toLowerCase().includes('yes')), "Yes")} {renderOddButton(lineData.options.find(o=>o.selection_name.toLowerCase().includes('no')), "No")} </>)
                                                                                    : lineData.options.map(odd => renderOddButton(odd, odd.selection_name.replace(playerName, '').trim()))}
                                                                        </div></div>))}</div>))}
                                                            </Disclosure.Panel></>)}
                                                    </Disclosure>))}
                                            </Disclosure.Panel>
                                        </>)}
                                    </Disclosure>);
                                })}

                                {/* Game Bets Tab Rendering */}
                                {tabName === 'Game Bets' &&
                                    (processedTabsData.contentByTab[tabName] as ProcessedMarket[] || []).map((market, marketIdx) => (
                                        <div key={market.fullBetTypeName + '-' + marketIdx} className="p-4 bg-sleeper-surface-100 rounded-lg shadow-lg border border-sleeper-border">
                                            <h4 className="text-lg font-semibold text-sleeper-primary mb-4">{market.fullBetTypeName}</h4>
                                            {market.lines.map((lineData, lineIdx) => (<div key={`${market.fullBetTypeName}-L${lineData.lineValue !== null ? lineData.lineValue : 'noLine'}-${lineIdx}`} className="mb-3 last:mb-0 p-3 bg-sleeper-surface-200 rounded-md border border-sleeper-border/50">
                                                {lineData.lineValue !== null && market.fullBetTypeName !== 'Moneyline' && !market.fullBetTypeName.toLowerCase().includes('even/odd') && !market.fullBetTypeName.toLowerCase().includes('3-way') && !market.fullBetTypeName.toLowerCase().includes('double chance') && (
                                                    <p className="text-sm text-sleeper-text-secondary mb-2">Line: {lineData.lineValue > 0 ? `+${lineData.lineValue.toFixed(1)}`:lineData.lineValue.toFixed(1)}</p>
                                                )}
                                                <div className={`grid ${lineData.options.length === 3 ? 'grid-cols-3' : (lineData.options.length === 1 ? 'grid-cols-1' : 'grid-cols-2')} gap-3`}>
                                                    {lineData.options.sort((a,b)=>{if(a.selection_name.toLowerCase().includes('over')||a.selection_name.toLowerCase().includes('yes'))return-1;if(b.selection_name.toLowerCase().includes('over')||b.selection_name.toLowerCase().includes('yes'))return 1; if (game && a.selection_name === game.home_team) return -1; if (game && b.selection_name === game.home_team) return 1; return a.selection_name.localeCompare(b.selection_name);}).map(odd=>renderOddButton(odd,odd.selection_name))}
                                                </div>
                                            </div>))}
                                        </div>
                                    ))}
                            </Tab.Panel>))}
                    </Tab.Panels>
                </Tab.Group>
            )}
        </div>
    );
}
export default GameDetailPage;