// frontend/src/components/GameDetailPage.tsx
import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { toast } from 'react-toastify';
import { Disclosure } from '@headlessui/react';
import { ChevronUpIcon, ArrowLeftIcon } from '@heroicons/react/20/solid';
import { useDashboardOutletContext } from '../App';
import { americanToDecimal } from '../utils/oddsConverter';

interface Game { id: number; api_game_id: string; home_team: string; away_team: string; game_time: string; status: string; home_score?: number | null; away_score?: number | null; }
interface BetType { id: number; name: string; api_market_key: string; description?: string; }
export interface AvailableBetDetail {
    id: number; game_id: number; bet_type_id: number; selection_name: string;
    odds: number; line?: number | null; is_active: boolean; is_winning_outcome?: boolean | null;
    source_bookmaker?: string | null; api_last_update?: string | null;
    bet_type: Pick<BetType, 'id' | 'name' | 'api_market_key' | 'description'>;
    game_info_for_slip: { id: number; api_game_id: string; home_team: string; away_team: string; game_time: string; }
}

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
            const { data: fetchedOdds, error: oddsError } = await supabase.from('available_bets').select(`*, bet_type:bet_types!inner(*)`).eq('game_id', gameDetails.id).eq('is_active', true).order('bet_type_id').order('line', { nullsFirst: true }).order('selection_name');
            if (oddsError) throw oddsError;
            const oddsWithCtx = fetchedOdds?.map(o=>({...o, game_info_for_slip:{id:gameDetails.id,api_game_id:gameDetails.api_game_id,home_team:gameDetails.home_team,away_team:gameDetails.away_team,game_time:gameDetails.game_time}}))||[];
            setOddsData(oddsWithCtx as AvailableBetDetail[]);
        } catch (err:any) { console.error('Err GameDetailFetch:', err); setError(err.message); toast.error(`Load err: ${err.message}`);
        } finally { setLoading(false); }
    }, [dbGameId]);

    useEffect(() => { fetchGameDetailsAndOdds(); }, [fetchGameDetailsAndOdds]);

    const handleOddSelectWrapper = (odd: AvailableBetDetail) => {
        // *** ADDED CONSOLE LOGS ***
        console.log('GameDetailPage: handleOddSelectWrapper called for odd:', odd.id, odd.selection_name);
        const alreadyInSlip = isOddInBetSlip(odd.id);
        console.log('GameDetailPage: Is odd already in slip?', alreadyInSlip);
        console.log('GameDetailPage: Is odd active?', odd.is_active);

        if (alreadyInSlip) { toast.info(`${odd.selection_name} is already in your bet slip.`); return; }
        if (!odd.is_active) { toast.warn('This betting option is no longer active.'); return; }
        addToBetSlip(odd);
    };

    const categorizedOdds = useMemo(() => { /* ... (categorization logic remains the same) ... */
        if (!oddsData) return {};
        const categories: Record<string, AvailableBetDetail[]> = {};
        const categoryOrder = ['Game Lines', 'Team Totals', '1st Quarter', '2nd Quarter', '1st Half', '3rd Quarter', '4th Quarter', '2nd Half', 'Passing Props', 'Rushing Props', 'Receiving Props', 'Touchdown Props', 'Kicker Props', 'Defense/ST Props', 'Fantasy Score Props', 'Other Player Props', 'Game Props', 'Other Bets'];
        categoryOrder.forEach(cat => { categories[cat] = []; }); categories['Other Bets'] = [];
        oddsData.forEach((odd) => {
            const key = odd.bet_type?.api_market_key?.toLowerCase() || 'unknown'; let cat = 'Other Bets';
            if (['h2h', 'spreads', 'totals'].includes(key)) cat = 'Game Lines';
            else if (['team_points_home_ou', 'team_points_away_ou'].includes(key)) cat = 'Team Totals';
            else if (key.startsWith('player_')) { if (key.includes('pass')) cat='Passing Props'; else if (key.includes('rush')) cat='Rushing Props'; else if (key.includes('receiv')) cat='Receiving Props'; else if (key.includes('touchdown')) cat='Touchdown Props'; else if (key.includes('kick')||key.includes('fieldgoal')||key.includes('extrapoint')) cat='Kicker Props'; else if (key.includes('defense_')||key.includes('sack')||key.includes('interception')) cat='Defense/ST Props'; else if (key.includes('fantasyscore')) cat='Fantasy Score Props'; else cat='Other Player Props'; }
            else if (key.startsWith('1q_')) cat='1st Quarter'; else if (key.startsWith('2q_')) cat='2nd Quarter'; else if (key.startsWith('1h_')) cat='1st Half'; else if (key.startsWith('3q_')) cat='3rd Quarter'; else if (key.startsWith('4q_')) cat='4th Quarter'; else if (key.startsWith('2h_')) cat='2nd Half';
            else if (['game_total_eo', 'team_points_home_eo', 'team_points_away_eo', 'reg_ml3way', 'reg_double_chance'].includes(key)) cat = 'Game Props';
            categories[cat].push(odd);
        });
        const ordered:Record<string,AvailableBetDetail[]>={}; categoryOrder.forEach(cn=>{if(categories[cn]?.length>0)ordered[cn]=categories[cn];}); if(categories['Other Bets']?.length>0 && !ordered['Other Bets'])ordered['Other Bets']=categories['Other Bets'];
        return ordered;
    }, [oddsData]);

    if (loading) return <div className="text-center py-10 text-xl text-sleeper-accent">Loading ...</div>;
    if (error) return <div className="text-center py-10 text-xl text-red-500">Error: {error}</div>;
    if (!game) return <div className="text-center py-10 text-xl">Game not found.</div>;

    const gameDate = new Date(game.game_time);
    const formattedDate = `${gameDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} - ${gameDate.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: true })}`;
    const isLive = game.status.toLowerCase().includes('live') || game.status.toLowerCase().includes('inplay');
    const isFinal = game.status.toLowerCase().includes('final') || game.status.toLowerCase().includes('completed');

    return (
        <div className="container mx-auto px-2 sm:px-4 py-6 text-sleeper-text-primary">
            <Link to="/" className="inline-flex items-center mb-4 text-sleeper-accent hover:text-sleeper-accent-light"><ArrowLeftIcon className="h-5 w-5 mr-2" /> Back to Games</Link>
            <div className="bg-sleeper-secondary p-4 sm:p-6 rounded-lg shadow-xl mb-6">
                <div className="flex flex-col sm:flex-row justify-between items-center mb-2"><h1 className="text-2xl sm:text-3xl font-bold text-sleeper-text-primary truncate">{game.away_team} @ {game.home_team}</h1><span className="text-sm text-gray-400 mt-1 sm:mt-0">{formattedDate}</span></div>
                <div className="text-center sm:text-right">{isFinal && game.home_score!=null && game.away_score!=null && (<p className="text-xl font-semibold text-sleeper-accent">Final: {game.away_team} {game.away_score} - {game.home_team} {game.home_score}</p>)}{isLive && <span className="px-3 py-1 text-sm font-semibold text-red-100 bg-red-600 rounded-full animate-pulse">LIVE</span>}{!isFinal && !isLive && <p className="text-md text-gray-400 capitalize">Status: {game.status}</p>}</div>
            </div>
            {(!oddsData || Object.keys(categorizedOdds).length === 0) && !loading ? (<p className="text-center text-lg text-gray-400 py-8">No active odds for this game.</p>) : (
                <div className="space-y-3">
                    {Object.entries(categorizedOdds).map(([categoryName, oddsList]) => {
                        if (oddsList.length === 0) return null;
                        const groupedByBetTypeName = oddsList.reduce((acc, odd) => { const key = odd.bet_type?.name || 'Unknown'; if (!acc[key]) acc[key] = []; acc[key].push(odd); return acc; }, {} as Record<string, AvailableBetDetail[]>);
                        return (
                            <Disclosure key={categoryName} as="div" className="bg-sleeper-secondary rounded-lg shadow" defaultOpen={['Game Lines', 'Team Totals'].includes(categoryName) || oddsList.length < 12}>
                                {({ open }) => (<>
                                    <Disclosure.Button className="flex justify-between items-center w-full px-4 py-3 text-lg font-medium text-left text-sleeper-primary hover:bg-sleeper-tertiary focus:outline-none rounded-t-lg"><span>{categoryName} <span className="text-xs text-gray-400">({oddsList.length})</span></span><ChevronUpIcon className={`${open?'rotate-180':''} w-6 h-6 text-sleeper-accent`} /></Disclosure.Button>
                                    <Disclosure.Panel className="px-2 sm:px-4 pt-3 pb-4 text-sm border-t border-sleeper-border"><div className="space-y-4">
                                        {Object.entries(groupedByBetTypeName).map(([betTypeName, specificOdds]) => (
                                            <div key={betTypeName} className="p-3 bg-sleeper-bg-secondary/30 rounded-md shadow-sm">
                                                <h4 className="text-md font-semibold text-sleeper-accent mb-3">{betTypeName}</h4>
                                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                                                    {specificOdds.sort((a,b)=>{if(a.selection_name.toLowerCase().includes('over')&&b.selection_name.toLowerCase().includes('under'))return -1; if(a.selection_name.toLowerCase().includes('under')&&b.selection_name.toLowerCase().includes('over'))return 1; if(a.selection_name.toLowerCase().includes('yes')&&b.selection_name.toLowerCase().includes('no'))return -1; if(a.selection_name.toLowerCase().includes('no')&&b.selection_name.toLowerCase().includes('yes'))return 1; if(a.line!=null&&b.line!=null&&a.line!==b.line)return(a.line||0)-(b.line||0);return a.selection_name.localeCompare(b.selection_name);}).map((odd) => {const decimalOddForDisplay = americanToDecimal(odd.odds);return (<button key={odd.id} onClick={()=>handleOddSelectWrapper(odd)} disabled={isOddInBetSlip(odd.id)||!odd.is_active} className={`w-full p-3 text-left rounded focus:outline-none flex justify-between items-center group shadow-md ${isOddInBetSlip(odd.id)?'bg-sleeper-accent-dark text-white cursor-not-allowed ring-2 ring-sleeper-accent-light':odd.is_active?'bg-sleeper-tertiary hover:bg-sleeper-accent text-sleeper-text-primary focus:ring-2 focus:ring-sleeper-accent-light':'bg-gray-700 text-gray-500 cursor-not-allowed opacity-60'}`}><span className="block text-sm font-medium truncate group-hover:text-white">{odd.selection_name}</span><span className={`block text-lg font-bold ${isOddInBetSlip(odd.id)?'text-white':odd.is_active?'text-sleeper-accent-light group-hover:text-white':'text-gray-500'}`}>{decimalOddForDisplay.toFixed(2)}</span></button>);})}
                                                </div>
                                            </div>
                                        ))}
                                    </div></Disclosure.Panel>
                                </>)}
                            </Disclosure>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
export default GameDetailPage;