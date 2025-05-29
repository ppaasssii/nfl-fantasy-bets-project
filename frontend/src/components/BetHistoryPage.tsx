// frontend/src/components/BetHistoryPage.tsx
import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '../supabaseClient';
import { useAuthContext } from '../App';
import { toast } from 'react-toastify';
import { americanToDecimal } from '../utils/oddsConverter';
import { InboxIcon, ArrowPathIcon } from '@heroicons/react/24/outline';

interface BetHistorySelectionDisplay {
    odds_at_placement: number;
    actual_stat_value_at_settlement?: number | null;
    available_bets: {
        selection_name: string;
        line: number | null;
        bet_types: { name: string; api_market_key: string; };
        games: {
            home_team: string;
            away_team: string;
            game_time: string;
            home_score?: number | null;
            away_score?: number | null;
        }
    };
}
interface BetHistoryItemDisplay {
    id: number;
    stake_amount: number;
    potential_payout: number;
    total_odds: number; // Stored as Decimal
    status: string;
    bet_type: 'single' | 'parlay';
    placed_at: string;
    user_bet_selections: BetHistorySelectionDisplay[];
}

const BetHistoryPage: React.FC = () => {
    const { session } = useAuthContext();
    const [allBets, setAllBets] = useState<BetHistoryItemDisplay[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [sortBy, setSortBy] = useState<string>('placed_at_desc');

    useEffect(() => {
        const fetchBetHistory = async () => {
            if (!session?.user) { setAllBets([]); setLoading(false); return; }
            setLoading(true);
            try {
                const { data, error: fetchError } = await supabase
                    .from('user_bets')
                    .select(`
                        id, stake_amount, potential_payout, total_odds, status, bet_type, placed_at,
                        user_bet_selections (
                            odds_at_placement,
                            actual_stat_value_at_settlement,
                            available_bets (
                               selection_name, 
                               line,
                               bet_types (name, api_market_key), 
                               games (home_team, away_team, game_time, home_score, away_score)
                            )
                        )
                    `)
                    .eq('user_id', session.user.id)
                    .order('placed_at', { ascending: false })
                    .limit(100);

                if (fetchError) {
                    console.error("Error fetching bet history (raw):", fetchError);
                    toast.error(`Failed to load bet history: ${fetchError.message} (Code: ${fetchError.code})`);
                    // No throw fetchError here, let it fall to finally
                } else {
                    setAllBets((data as BetHistoryItemDisplay[]) || []);
                }
            } catch (err: any) {
                console.error("Error in fetchBetHistory general catch:", err);
                if (!toast.isActive('fetchHistoryErrorToast')) {
                    toast.error(err.message || "An unknown error occurred loading history.", { toastId: 'fetchHistoryErrorToast'});
                }
                setAllBets([]);
            } finally {
                setLoading(false);
            }
        };
        fetchBetHistory();
    }, [session]);

    const displayedBets = useMemo(() => {
        let filtered = [...allBets];
        if (statusFilter !== 'all') {
            filtered = filtered.filter(bet => bet.status === statusFilter);
        }
        switch (sortBy) {
            case 'stake_asc': filtered.sort((a, b) => a.stake_amount - b.stake_amount); break;
            case 'stake_desc': filtered.sort((a, b) => b.stake_amount - a.stake_amount); break;
            case 'payout_asc': filtered.sort((a, b) => a.potential_payout - b.potential_payout); break;
            case 'payout_desc': filtered.sort((a, b) => b.potential_payout - a.potential_payout); break;
            case 'placed_at_asc': filtered.sort((a,b) => new Date(a.placed_at).getTime() - new Date(b.placed_at).getTime()); break;
            default: filtered.sort((a, b) => new Date(b.placed_at).getTime() - new Date(a.placed_at).getTime()); break;
        }
        return filtered;
    }, [allBets, statusFilter, sortBy]);

    const getStatUnit = (marketKey: string): string => {
        if (!marketKey) return '';
        const lmk = marketKey.toLowerCase();
        if (lmk.includes('yards')) return ' yds';
        if (lmk.includes('receptions')||lmk.includes('completions')||lmk.includes('attempts')) return '';
        if (lmk.includes('touchdown')||lmk.includes('interception')||lmk.includes('sack')||lmk.includes('extrapoint')||lmk.includes('fieldgoal')) return '';
        if (lmk.includes('points')&&!lmk.includes('spread')) return ' pts';
        return '';
    };

    if (loading) return (<div className="flex flex-col justify-center items-center min-h-[300px] p-6"><ArrowPathIcon className="h-10 w-10 text-sleeper-primary animate-spin mb-4" /><p className="text-sleeper-text-secondary text-lg">Loading Bet History...</p></div>);
    if (!session && !loading) return (<div className="p-6 bg-sleeper-surface-100 rounded-xl shadow-xl text-center border border-sleeper-border"><h1 className="text-2xl font-bold text-sleeper-text-primary mb-2">Bet History</h1><p className="text-sleeper-text-secondary">Please log in to view your bet history.</p></div>);

    return (
        <div className="p-4 sm:p-6 bg-sleeper-surface-100 rounded-xl shadow-2xl border border-sleeper-border">
            <div className="flex flex-col sm:flex-row justify-between items-center mb-6 pb-4 border-b border-sleeper-border">
                <h1 className="text-3xl font-bold text-sleeper-primary mb-4 sm:mb-0">Your Bet History</h1>
                <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
                    <div>
                        <label htmlFor="statusFilter" className="block text-xs font-medium text-sleeper-text-secondary mb-1">Status Filter</label>
                        <select
                            id="statusFilter"
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className="block w-full sm:w-40 pl-3 pr-10 py-2.5 text-sm rounded-md shadow-sm
                                       bg-sleeper-surface-200 border-sleeper-border bg-sleeper-bg
                                       focus:outline-none focus:ring-2 focus:ring-sleeper-primary focus:border-sleeper-primary
                                       custom-scrollbar"
                        >
                            <option value="all" >All</option>
                            <option value="pending">Pending</option>
                            <option value="won">Won</option>
                            <option value="lost">Lost</option>
                            <option value="void">Void</option>
                        </select>
                    </div>
                    <div>
                        <label htmlFor="sortBy" className="block text-xs font-medium text-sleeper-text-secondary mb-1">Sort
                            By</label>
                        <select
                            id="sortBy"
                            value={sortBy}
                            onChange={(e) => setSortBy(e.target.value)}
                            className="block w-full sm:w-48 pl-3 pr-10 py-2.5 text-sm rounded-md shadow-sm
                                       bg-sleeper-surface-200 border-sleeper-border bg-sleeper-bg
                                       focus:outline-none focus:ring-2 focus:ring-sleeper-primary focus:border-sleeper-primary
                                       custom-scrollbar"
                        >
                            <option value="placed_at_desc"
                                    className="bg-sleeper-surface-200 text-sleeper-text-primary">Newest Bet First
                            </option>
                            <option value="placed_at_asc"
                                    className="bg-sleeper-surface-200 text-sleeper-text-primary">Oldest Bet First
                            </option>
                            <option value="stake_desc"
                                    className="bg-sleeper-surface-200 text-sleeper-text-primary">Highest Stake First
                            </option>
                            <option value="stake_asc"
                                    className="bg-sleeper-surface-200 text-sleeper-text-primary">Lowest Stake First
                            </option>
                            <option value="payout_desc"
                                    className="bg-sleeper-surface-200 text-sleeper-text-primary">Highest Payout First
                            </option>
                            <option value="payout_asc"
                                    className="bg-sleeper-surface-200 text-sleeper-text-primary">Lowest Payout First
                            </option>

                        </select>
                    </div>
                </div>
            </div>
            {displayedBets.length === 0 && !loading ? (
                <div className="text-center py-16 bg-sleeper-surface-200/30 rounded-lg shadow-inner border border-dashed border-sleeper-border"><InboxIcon className="mx-auto h-16 w-16 text-sleeper-text-secondary opacity-40" /><h3 className="mt-4 text-lg font-medium text-sleeper-text-primary">No Bets Found</h3><p className="mt-1 text-sm text-sleeper-text-secondary">It looks like your betting slate is clean!</p></div>
            ) : (
                <div className="space-y-6">
                    {displayedBets.map((bet) => {
                        let statusColorClass = 'border-l-sleeper-interactive text-sleeper-interactive'; // Default for PENDING
                        let statusBgClass = 'bg-sleeper-surface-200';
                        if (bet.status === 'won') { statusColorClass = 'border-l-sleeper-success text-sleeper-success'; statusBgClass = 'bg-sleeper-success/5';}
                        else if (bet.status === 'lost') { statusColorClass = 'border-l-sleeper-error text-sleeper-error'; statusBgClass = 'bg-sleeper-error/5';}
                        else if (bet.status === 'void') { statusColorClass = 'border-l-sleeper-warning text-sleeper-warning'; statusBgClass = 'bg-sleeper-warning/5';}

                        return (
                            <div key={bet.id} className={`p-4 sm:p-5 rounded-lg shadow-lg border-l-4 ${statusBgClass} ${statusColorClass.split(' ')[0]}`}>
                                <div className="flex flex-col sm:flex-row justify-between items-start mb-3">
                                    <div className="mb-3 sm:mb-0 flex-grow"><p className="text-xs text-sleeper-text-secondary mb-1">ID: {bet.id} | Placed: {new Date(bet.placed_at).toLocaleString([],{year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}</p><p className={`text-lg font-semibold capitalize text-sleeper-text-primary`}>{bet.bet_type} Bet - <span className={`font-bold ${statusColorClass.split(' ')[1]}`}>{bet.status.toUpperCase()}</span></p></div>
                                    <div className="text-left sm:text-right w-full sm:w-auto bg-sleeper-surface-100 p-3 rounded-md shadow-inner border border-sleeper-border/30">
                                        <p className="text-sm text-sleeper-text-secondary">Stake: <span className="font-semibold text-sleeper-text-primary">${bet.stake_amount.toFixed(2)}</span></p>
                                        <p className="text-sm text-sleeper-text-secondary">Odds (Decimal): <span className="font-semibold text-sleeper-text-primary">{bet.total_odds.toFixed(2)}</span></p>
                                        <p className={`text-md font-semibold ${statusColorClass.split(' ')[1]}`}>
                                            {bet.status === 'won' ? `Won: $${bet.potential_payout.toFixed(2)}` : bet.status === 'void' ? `Refund: $${bet.stake_amount.toFixed(2)}` : `To Win: $${bet.potential_payout.toFixed(2)}`}
                                        </p>
                                    </div>
                                </div>
                                <div className="mt-4 space-y-2.5 border-t border-sleeper-border pt-3">
                                    {bet.user_bet_selections.map((sel, index) => {
                                        const decimalOddsTaken = americanToDecimal(sel.odds_at_placement);
                                        const statUnit = sel.available_bets.bet_types.api_market_key ? getStatUnit(sel.available_bets.bet_types.api_market_key) : '';
                                        const isSettledAndActualValueExists = bet.status !== 'pending' && sel.actual_stat_value_at_settlement !== null && sel.actual_stat_value_at_settlement !== undefined;
                                        return (
                                            <div key={index} className="ml-0 sm:ml-2 p-3 bg-sleeper-surface-200/80 rounded text-sm shadow-sm border border-sleeper-border/30">
                                                <p className="text-sleeper-text-primary font-medium">{sel.available_bets.selection_name}<span className="text-sleeper-text-secondary text-xs ml-2">({sel.available_bets.bet_types.name})</span></p>
                                                <p className="text-sleeper-interactive font-medium">Odds Taken: {decimalOddsTaken.toFixed(2)}{sel.available_bets.line !== null && ` (Line: ${sel.available_bets.line > 0 ? `+${sel.available_bets.line.toFixed(1)}` : sel.available_bets.line.toFixed(1)})`}</p>
                                                <p className="text-xs text-sleeper-text-secondary mt-1">Game: {sel.available_bets.games.away_team} @ {sel.available_bets.games.home_team}<span className="text-sleeper-text-secondary/70"> ({new Date(sel.available_bets.games.game_time).toLocaleDateString()})</span></p>
                                                {isSettledAndActualValueExists && (<p className="text-xs text-sleeper-accent mt-1 font-semibold">Actual Result: {sel.actual_stat_value_at_settlement}{statUnit}</p>)}
                                                {bet.status !== 'pending' && sel.available_bets.games.home_score != null && sel.available_bets.games.away_score != null ? (<p className="text-xs text-sleeper-text-secondary mt-1">Final Score: {sel.available_bets.games.away_score ?? '-'} - {sel.available_bets.games.home_score ?? '-'}</p>): null}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};
export default BetHistoryPage;