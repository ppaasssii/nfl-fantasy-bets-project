// frontend/src/components/GameDetailPage.tsx
import React, { useEffect, useState, useMemo, useCallback, Fragment } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { toast } from 'react-toastify';
import { Tab, Disclosure } from '@headlessui/react'; // Disclosure might still be useful within player sections
import { ChevronUpIcon, ArrowLeftIcon, UserCircleIcon } from '@heroicons/react/20/solid'; // Added UserCircleIcon
import { useDashboardOutletContext } from '../App';
import { americanToDecimal } from '../utils/oddsConverter';

// Types (Game, BetTypeInterface, AvailableBetDetail remain the same)
interface Game { id: number; api_game_id: string; home_team: string; away_team: string; game_time: string; status: string; home_score?: number | null; away_score?: number | null; }
interface BetTypeInterface { id: number; name: string; api_market_key: string; description?: string; }
export interface AvailableBetDetail {
    id: number; game_id: number; bet_type_id: number; selection_name: string;
    odds: number; line?: number | null; is_active: boolean; is_winning_outcome?: boolean | null;
    source_bookmaker?: string | null; api_last_update?: string | null;
    bet_type: Pick<BetTypeInterface, 'id' | 'name' | 'api_market_key' | 'description'>;
    game_info_for_slip: { id: number; api_game_id: string; home_team: string; away_team: string; game_time: string; }
}

// Helper function to group odds by bet_type.name (still useful for non-player prop tabs)
const groupOddsByBetTypeName = (oddsList: AvailableBetDetail[]): Record<string, AvailableBetDetail[]> => { /* ... same ... */
    return oddsList.reduce((acc, odd) => {
        const key = odd.bet_type?.name || 'Other Bets';
        if (!acc[key]) acc[key] = []; acc[key].push(odd);
        return acc;
    }, {} as Record<string, AvailableBetDetail[]>);
};

// Helper to attempt to extract player name from selection_name (heuristic)
const extractPlayerNameFromSelection = (selectionName: string, betTypeName: string): string => {
    // Remove common suffixes like " Over X.X", " Under X.X", " Yes", " No"
    // Also remove the bet type name itself if it's part of the selection name for some reason
    let name = selectionName
        .replace(/ (Over|Under) [\d.]+$/, '')
        .replace(/ (Yes|No)$/, '')
        .replace(new RegExp(` ${betTypeName.replace(/ O\/U$| Yes\/No$/, '')}`, 'i'), '') // Remove base bet type name
        .trim();
    // A very basic attempt, might need refinement based on your selection_name patterns
    // E.g., if selection_name is "Geno Smith Rushing Yards Over 3.5", betTypeName is "Player Rushing Yards O/U"
    // We want "Geno Smith"
    const betTypeBase = betTypeName.replace(/^Player /i, '').replace(/ O\/U$/i, '').replace(/ Yes\/No$/i, '').trim();
    if (name.toLowerCase().includes(betTypeBase.toLowerCase())) {
        name = name.replace(new RegExp(betTypeBase, 'i'), '').trim();
    }
    return name || "Unknown Player";
};


const GameDetailPage: React.FC = () => {
    // ... (useState, useParams, useDashboardOutletContext, fetchGameDetailsAndOdds, handleOddSelectWrapper - all same as v1.0.9 from previous step) ...
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
            const { data: fetchedOdds, error: oddsError } = await supabase.from('available_bets').select(`*, bet_type:bet_types!inner(*)`).eq('game_id', gameDetails.id).eq('is_active', true).order('bet_type_id').order('line', { nullsFirst: true }).order('selection_name');
            if (oddsError) throw oddsError;
            const oddsWithCtx = fetchedOdds?.map(o=>({...o, game_info_for_slip:{id:gameDetails.id,api_game_id:gameDetails.api_game_id,home_team:gameDetails.home_team,away_team:gameDetails.away_team,game_time:gameDetails.game_time}}))||[];
            setOddsData(oddsWithCtx as AvailableBetDetail[]);
        } catch (err:any) { console.error('Err GameDetailFetch:', err); setError(err.message); toast.error(`Load err: ${err.message}`);
        } finally { setLoading(false); }
    }, [dbGameId]);

    useEffect(() => { fetchGameDetailsAndOdds(); }, [fetchGameDetailsAndOdds]);

    const handleOddSelectWrapper = (odd: AvailableBetDetail) => {
        if (isOddInBetSlip(odd.id)) { toast.info(`${odd.selection_name} is already in slip.`); return; }
        if (!odd.is_active) { toast.warn('Bet no longer active.'); return; }
        addToBetSlip(odd);
    };

    // Categorize odds for tabs
    const categorizedOddsForTabs = useMemo(() => {
        if (!oddsData) return { tabNames: [], tabPanelsContent: {}, playerPropsByPlayer: {} };

        const mainCategories: Record<string, { name: string; odds: AvailableBetDetail[] }> = {
            'GAME_LINES': { name: 'Game Lines', odds: [] }, 'TEAM_PROPS': { name: 'Team Props', odds: [] },
            'PERIOD_MARKETS': { name: 'Period Markets', odds: [] }, 'PLAYER_PROPS': { name: 'Player Props', odds: [] },
            'ALL_MARKETS': { name: 'All Markets', odds: [...oddsData] }
        };
        const periodKeys = ['1q_', '2q_', '1h_', '3q_', '4q_', '2h_'];

        oddsData.forEach((odd) => {
            const marketKey = odd.bet_type?.api_market_key?.toLowerCase() || 'unknown';
            if (['h2h', 'spreads', 'totals'].includes(marketKey)) mainCategories['GAME_LINES'].odds.push(odd);
            else if (['team_points_home_ou', 'team_points_away_ou', 'team_points_home_eo', 'team_points_away_eo'].includes(marketKey)) mainCategories['TEAM_PROPS'].odds.push(odd);
            else if (marketKey.startsWith('player_')) mainCategories['PLAYER_PROPS'].odds.push(odd);
            else if (periodKeys.some(pk => marketKey.startsWith(pk))) mainCategories['PERIOD_MARKETS'].odds.push(odd);
            else if (['game_total_eo', 'reg_ml3way', 'reg_double_chance'].includes(marketKey)){ if(!mainCategories['GAME_PROPS']) mainCategories['GAME_PROPS'] = {name: 'Game Props', odds:[]}; mainCategories['GAME_PROPS'].odds.push(odd); }
        });

        const tabs = Object.values(mainCategories).filter(cat => cat.odds.length > 0).map(cat => cat.name);
        if(mainCategories['ALL_MARKETS'].odds.length > 0 && tabs.includes('All Markets')) { const idx = tabs.indexOf('All Markets'); if(idx > 0) { const allTab = tabs.splice(idx, 1)[0]; tabs.unshift(allTab); }}

        // *** NEW: Process Player Props for sub-grouping by player ***
        const playerPropsByPlayer: Record<string, Record<string, AvailableBetDetail[]>> = {};
        if (mainCategories['PLAYER_PROPS']) {
            mainCategories['PLAYER_PROPS'].odds.forEach(odd => {
                const betTypeName = odd.bet_type?.name || "Unknown Prop Type";
                const playerName = extractPlayerNameFromSelection(odd.selection_name, betTypeName); // Use helper

                if (!playerPropsByPlayer[playerName]) playerPropsByPlayer[playerName] = {};
                if (!playerPropsByPlayer[playerName][betTypeName]) playerPropsByPlayer[playerName][betTypeName] = [];
                playerPropsByPlayer[playerName][betTypeName].push(odd);
            });
        }

        return {
            tabNames: tabs,
            tabPanelsContent: Object.fromEntries(Object.entries(mainCategories).filter(([,v])=>v.odds.length > 0).map(([k,v])=>[v.name, groupOddsByBetTypeName(v.odds)])),
            playerPropsByPlayer // Add this to the returned object
        };
    }, [oddsData]);

    // ... (loading, error, !game checks remain the same) ...
    if (loading) return <div className="text-center py-10 text-xl text-sleeper-accent">Loading game details...</div>;
    if (error) return <div className="text-center py-10 text-xl text-red-500">Error: {error}</div>;
    if (!game) return <div className="text-center py-10 text-xl">Game not found.</div>;

    const gameDate = new Date(game.game_time);
    const formattedDate = `${gameDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} - ${gameDate.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: true })}`;
    const isLive = game.status.toLowerCase().includes('live') || game.status.toLowerCase().includes('inplay');
    const isFinal = game.status.toLowerCase().includes('final') || game.status.toLowerCase().includes('completed');

    return (
        <div className="container mx-auto px-2 sm:px-4 py-6 text-sleeper-text-primary">
            <Link to="/" className="inline-flex items-center mb-4 text-sleeper-accent hover:text-sleeper-accent-light"><ArrowLeftIcon className="h-5 w-5 mr-2" /> Back to Games</Link>
            <div className="bg-sleeper-secondary p-4 sm:p-6 rounded-lg shadow-xl mb-8"> {/* Game header */}
                <div className="flex flex-col sm:flex-row justify-between items-center mb-2"><h1 className="text-2xl sm:text-3xl font-bold text-sleeper-text-primary truncate">{game.away_team} @ {game.home_team}</h1><span className="text-sm text-gray-400 mt-1 sm:mt-0">{formattedDate}</span></div>
                <div className="text-center sm:text-right">{isFinal && game.home_score!=null && game.away_score!=null && (<p className="text-xl font-semibold text-sleeper-accent">Final: {game.away_team} {game.away_score} - {game.home_team} {game.home_score}</p>)}{isLive && <span className="px-3 py-1 text-sm font-semibold text-red-100 bg-red-600 rounded-full animate-pulse">LIVE</span>}{!isFinal && !isLive && <p className="text-md text-gray-400 capitalize">Status: {game.status}</p>}</div>
            </div>

            {(!oddsData || categorizedOddsForTabs.tabNames.length === 0) && !loading ? (
                <p className="text-center text-lg text-gray-400 py-8">No active odds for this game.</p>
            ) : (
                <Tab.Group>
                    <Tab.List className="flex space-x-1 rounded-xl bg-sleeper-secondary p-1 mb-4 overflow-x-auto">
                        {categorizedOddsForTabs.tabNames.map((category) => (
                            <Tab key={category} as={Fragment}>
                                {({ selected }) => (<button className={`w-full whitespace-nowrap rounded-lg py-2.5 px-2 sm:px-4 text-sm font-medium leading-5 focus:outline-none ${selected ? 'bg-sleeper-primary text-white shadow' : 'text-sleeper-text-secondary hover:bg-sleeper-tertiary hover:text-sleeper-text-primary'}`}>{category}</button>)}
                            </Tab>
                        ))}
                    </Tab.List>
                    <Tab.Panels className="mt-2">
                        {categorizedOddsForTabs.tabNames.map((categoryName) => {
                            const groupsInPanel = categorizedOddsForTabs.tabPanelsContent[categoryName];
                            return (
                                <Tab.Panel key={categoryName} className="rounded-xl bg-sleeper-bg-secondary p-3 focus:outline-none space-y-4">
                                    {/* *** MODIFIED: Special rendering for "Player Props" tab *** */}
                                    {categoryName === 'Player Props' ? (
                                        Object.entries(categorizedOddsForTabs.playerPropsByPlayer).map(([playerName, playerPropTypes]) => (
                                            <Disclosure key={playerName} as="div" className="bg-sleeper-surface rounded-lg shadow-md" defaultOpen>
                                                {({ open }) => (
                                                    <>
                                                        <Disclosure.Button className="flex justify-between w-full px-4 py-3 text-md font-semibold text-left text-sleeper-primary hover:bg-sleeper-tertiary rounded-t-lg">
                                                            <span className="flex items-center"><UserCircleIcon className="h-5 w-5 mr-2 text-sleeper-accent"/>{playerName}</span>
                                                            <ChevronUpIcon className={`${open ? 'rotate-180' : ''} w-5 h-5 text-sleeper-accent`} />
                                                        </Disclosure.Button>
                                                        <Disclosure.Panel className="px-4 pt-3 pb-4 text-sm border-t border-sleeper-border space-y-3">
                                                            {Object.entries(playerPropTypes).map(([betTypeName, oddsList]) => (
                                                                <div key={betTypeName}>
                                                                    <h5 className="text-sm font-medium text-sleeper-text-secondary mb-2">{betTypeName.replace(/^Player /i, '')}</h5>
                                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                                                        {oddsList.sort((a,b)=>a.selection_name.localeCompare(b.selection_name)).map(odd => { const decOdd = americanToDecimal(odd.odds); return (<button key={odd.id} onClick={()=>handleOddSelectWrapper(odd)} disabled={isOddInBetSlip(odd.id)||!odd.is_active} className={`w-full p-2.5 text-left rounded focus:outline-none flex justify-between items-center group shadow ${isOddInBetSlip(odd.id)?'bg-sleeper-accent-dark text-white cursor-not-allowed':'bg-sleeper-tertiary hover:bg-sleeper-accent text-primary focus:ring-sleeper-accent-light'}`}><span className="text-xs font-medium truncate group-hover:text-white">{odd.selection_name.replace(playerName, '').trim()}</span><span className={`font-bold ${isOddInBetSlip(odd.id)?'text-white':'text-sleeper-accent-light group-hover:text-white'}`}>{decOdd.toFixed(2)}</span></button>);})}
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </Disclosure.Panel>
                                                    </>
                                                )}
                                            </Disclosure>
                                        ))
                                    ) : ( // Original rendering for other tabs
                                        Object.entries(groupsInPanel).map(([betTypeName, oddsList]) => (
                                            <div key={betTypeName} className="p-3 bg-sleeper-surface rounded-md shadow-sm border border-sleeper-border">
                                                <h4 className="text-md font-semibold text-sleeper-accent mb-3">{betTypeName} ({oddsList.length})</h4>
                                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                                                    {oddsList.sort((a,b)=>{/* sort logic */ if(a.selection_name.toLowerCase().includes('over')&&b.selection_name.toLowerCase().includes('under'))return -1;if(a.selection_name.toLowerCase().includes('under')&&b.selection_name.toLowerCase().includes('over'))return 1;if(a.selection_name.toLowerCase().includes('yes')&&b.selection_name.toLowerCase().includes('no'))return -1;if(a.selection_name.toLowerCase().includes('no')&&b.selection_name.toLowerCase().includes('yes'))return 1;if(a.line!=null&&b.line!=null&&a.line!==b.line)return(a.line||0)-(b.line||0);return a.selection_name.localeCompare(b.selection_name);}).map(odd => { const decOdd = americanToDecimal(odd.odds); return (<button key={odd.id} onClick={()=>handleOddSelectWrapper(odd)} disabled={isOddInBetSlip(odd.id)||!odd.is_active} className={`w-full p-3 text-left rounded focus:outline-none flex justify-between items-center group shadow ${isOddInBetSlip(odd.id)?'bg-sleeper-accent-dark text-white cursor-not-allowed':'bg-sleeper-tertiary hover:bg-sleeper-accent text-primary focus:ring-sleeper-accent-light'}`}><span className="text-sm font-medium truncate group-hover:text-white">{odd.selection_name}</span><span className={`text-lg font-bold ${isOddInBetSlip(odd.id)?'text-white':'text-sleeper-accent-light group-hover:text-white'}`}>{decOdd.toFixed(2)}</span></button>);})}
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </Tab.Panel>
                            );
                        })}
                    </Tab.Panels>
                </Tab.Group>
            )}
        </div>
    );
}
export default GameDetailPage;