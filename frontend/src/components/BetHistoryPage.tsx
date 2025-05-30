// frontend/src/components/BetHistoryPage.tsx
import React, {useEffect, useState, useMemo} from 'react';
import {supabase} from '../supabaseClient';
import {useAuthContext} from '../App';
import {toast} from 'react-toastify';
import {americanToDecimal} from '../utils/oddsConverter';
import {InboxIcon, ArrowPathIcon} from '@heroicons/react/24/outline';

// ... (your interfaces remain the same)
interface BetGameData {
    home_team: string;
    away_team: string;
    game_time: string;
    home_score?: number | null;
    away_score?: number | null;
}

interface BetTypeData {
    name: string;
    api_market_key: string;
}

interface AvailableBetDirectData {
    selection_name: string;
    line: number | null;
    bet_type: BetTypeData;
    game: BetGameData;
}

interface BetHistorySelectionDisplay {
    odds_at_placement: number;
    actual_stat_value_at_settlement?: number | null;
    available_bet: AvailableBetDirectData | null;
}

interface BetHistoryItemDisplay {
    id: number;
    stake_amount: number;
    potential_payout: number;
    total_odds: number;
    status: string;
    bet_type: 'single' | 'parlay';
    placed_at: string;
    user_bet_selections: BetHistorySelectionDisplay[];
}

const BetHistoryPage: React.FC = () => {
    const {session} = useAuthContext();
    const [allBets, setAllBets] = useState<BetHistoryItemDisplay[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [sortBy, setSortBy] = useState<string>('placed_at_desc');

    useEffect(() => {
        const fetchBetHistory = async () => {
            if (!session?.user) {
                setAllBets([]);
                setLoading(false);
                return;
            }
            setLoading(true);
            try {
                const {data, error: fetchError} = await supabase
                    .from('user_bets')
                    .select(`
                        id, stake_amount, potential_payout, total_odds, status, bet_type, placed_at,
                        user_bet_selections (
                            odds_at_placement,
                            actual_stat_value_at_settlement,
                            available_bet: available_bet_id (
                               selection_name,
                               line,
                               bet_type: bet_type_id (name, api_market_key),
                               game: game_id (home_team, away_team, game_time, home_score, away_score)
                            )
                        )
                    `)
                    .eq('user_id', session.user.id)
                    .order('placed_at', {ascending: false})
                    .limit(100);

                if (fetchError) {
                    console.error("Error fetching bet history (raw):", fetchError);
                    toast.error(`Failed to load bet history: ${fetchError.message} (Code: ${fetchError.code})`);
                    setAllBets([]);
                } else {
                    // ***************************************************
                    // ADD THIS LOGGING LINE:
                    console.log("Supabase raw data:", JSON.stringify(data, null, 2));
                    // ***************************************************

                    // The data should now directly map to BetHistoryItemDisplay[]
                    // as the logged structure matches the types when aliases work as expected.
                    setAllBets((data as any) || []);
                }
            } catch (err: any) {
                console.error("Error in fetchBetHistory general catch:", err);
                if (!toast.isActive('fetchHistoryErrorToast')) {
                    toast.error(err.message || "An unknown error occurred loading history.", {toastId: 'fetchHistoryErrorToast'});
                }
                setAllBets([]);
            } finally {
                setLoading(false);
            }
        };
        fetchBetHistory();
    }, [session]);

    // ... (rest of your component remains the same)
    const displayedBets = useMemo(() => {
        let filtered = [...allBets];
        if (statusFilter !== 'all') filtered = filtered.filter(bet => bet.status === statusFilter);
        switch (sortBy) {
            case 'stake_asc':
                filtered.sort((a, b) => a.stake_amount - b.stake_amount);
                break;
            case 'stake_desc':
                filtered.sort((a, b) => b.stake_amount - a.stake_amount);
                break;
            case 'payout_asc':
                filtered.sort((a, b) => a.potential_payout - b.potential_payout);
                break;
            case 'payout_desc':
                filtered.sort((a, b) => b.potential_payout - a.potential_payout);
                break;
            case 'placed_at_asc':
                filtered.sort((a, b) => new Date(a.placed_at).getTime() - new Date(b.placed_at).getTime());
                break;
            default: // placed_at_desc
                filtered.sort((a, b) => new Date(b.placed_at).getTime() - new Date(a.placed_at).getTime());
                break;
        }
        return filtered;
    }, [allBets, statusFilter, sortBy]);

    const getStatUnit = (marketKey: string): string => {
        if (!marketKey) return '';
        const lmk = marketKey.toLowerCase();
        if (lmk.includes('yards')) return ' yds';
        if (lmk.includes('receptions') || lmk.includes('completions') || lmk.includes('attempts')) return '';
        if (lmk.includes('touchdown') || lmk.includes('interception') || lmk.includes('sack') || lmk.includes('extrapoint') || lmk.includes('fieldgoal')) return '';
        if (lmk.includes('points') && !lmk.includes('spread')) return ' pts';
        return '';
    };


    if (loading) return (<div className="flex flex-col justify-center items-center min-h-[300px] p-6"><ArrowPathIcon
        className="h-10 w-10 text-sleeper-primary animate-spin mb-4"/><p
        className="text-sleeper-text-secondary text-lg">Loading Bet History...</p></div>);
    if (!session && !loading) return (
        <div className="p-6 bg-sleeper-surface-100 rounded-xl shadow-xl text-center border border-sleeper-border"><h1
            className="text-2xl font-bold text-sleeper-text-primary mb-2">Bet History</h1><p
            className="text-sleeper-text-secondary">Please log in to view your bet history.</p></div>);

    return (
        <div className="p-4 sm:p-6 bg-sleeper-surface-100 rounded-xl shadow-2xl border border-sleeper-border">
            <div
                className="flex flex-col sm:flex-row justify-between items-center mb-6 pb-4 border-b border-sleeper-border">
                <h1 className="text-3xl font-bold text-sleeper-primary mb-4 sm:mb-0">Your Bet History</h1>
                <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
                    <div><label htmlFor="statusFilter"
                                className="block text-xs font-medium text-sleeper-text-secondary mb-1">Filter
                        Status</label><select id="statusFilter" value={statusFilter}
                                              onChange={(e) => setStatusFilter(e.target.value)}
                                              className="block w-full sm:w-40 pl-3 pr-10 py-2.5 text-sm rounded-md shadow-sm bg-sleeper-bg border-sleeper-border text-sleeper-text-primary focus:outline-none focus:ring-2 focus:ring-sleeper-primary focus:border-sleeper-primary custom-scrollbar">
                        <option value="all">All</option>
                        <option value="pending">Pending</option>
                        <option value="won">Won</option>
                        <option value="lost">Lost</option>
                        <option value="void">Void</option>
                    </select></div>
                    <div><label htmlFor="sortBy" className="block text-xs font-medium text-sleeper-text-secondary mb-1">Sort
                        By</label><select id="sortBy" value={sortBy} onChange={(e) => setSortBy(e.target.value)}
                                          className="block w-full sm:w-48 pl-3 pr-10 py-2.5 text-sm rounded-md shadow-sm bg-sleeper-bg border-sleeper-border text-sleeper-text-primary focus:outline-none focus:ring-2 focus:ring-sleeper-primary focus:border-sleeper-primary custom-scrollbar">
                        <option value="placed_at_desc">Newest</option>
                        <option value="placed_at_asc">Oldest</option>
                        <option value="stake_desc">Highest Stake</option>
                        <option value="stake_asc">Lowest Stake</option>
                        <option value="payout_desc">Highest Payout</option>
                        <option value="payout_asc">Lowest Payout</option>
                    </select></div>
                </div>
            </div>

            {displayedBets.length === 0 && !loading ? (<div
                className="text-center py-16 bg-sleeper-surface-200/30 rounded-lg shadow-inner border border-dashed border-sleeper-border">
                <InboxIcon className="mx-auto h-16 w-16 text-sleeper-text-secondary opacity-40"/><h3
                className="mt-4 text-lg font-medium text-sleeper-text-primary">No Bets Found</h3><p
                className="mt-1 text-sm text-sleeper-text-secondary">It looks like your betting slate is clean!</p>
            </div>) : (
                <div className="space-y-6">
                    {displayedBets.map((bet) => {
                        let sC = 'border-l-sleeper-interactive text-sleeper-interactive', sB = 'bg-sleeper-surface-200';
                        if (bet.status === 'won') {
                            sC = 'border-l-sleeper-success text-sleeper-success';
                            sB = 'bg-sleeper-success/5';
                        } else if (bet.status === 'lost') {
                            sC = 'border-l-sleeper-error text-sleeper-error';
                            sB = 'bg-sleeper-error/5';
                        } else if (bet.status === 'void') {
                            sC = 'border-l-sleeper-warning text-sleeper-warning';
                            sB = 'bg-sleeper-warning/5';
                        }
                        return (<div key={bet.id}
                                     className={`p-4 sm:p-5 rounded-lg shadow-lg border-l-4 ${sB} ${sC.split(' ')[0]}`}>
                            <div className="flex flex-col sm:flex-row justify-between items-start mb-3">
                                <div className="mb-3 sm:mb-0 flex-grow"><p
                                    className="text-xs text-sleeper-text-secondary mb-1">ID:{bet.id} |
                                    Placed:{new Date(bet.placed_at).toLocaleString([], {
                                        year: 'numeric',
                                        month: 'short',
                                        day: 'numeric',
                                        hour: '2-digit',
                                        minute: '2-digit'
                                    })}</p><p
                                    className={`text-lg font-semibold capitalize text-sleeper-text-primary`}>{bet.bet_type} Bet
                                    - <span
                                        className={`font-bold ${sC.split(' ')[1]}`}>{bet.status.toUpperCase()}</span>
                                </p></div>
                                <div
                                    className="text-left sm:text-right w-full sm:w-auto bg-sleeper-surface-100 p-3 rounded-md shadow-inner border border-sleeper-border/30">
                                    <p className="text-sm text-sleeper-text-secondary">Stake:<span
                                        className="font-semibold text-sleeper-text-primary">${bet.stake_amount.toFixed(2)}</span>
                                    </p><p className="text-sm text-sleeper-text-secondary">Odds:<span
                                    className="font-semibold text-sleeper-text-primary">{bet.total_odds.toFixed(2)}</span>
                                </p><p
                                    className={`text-md font-semibold ${sC.split(' ')[1]}`}>{bet.status === 'won' ? `Won:$${bet.potential_payout.toFixed(2)}` : bet.status === 'void' ? `Refund:$${bet.stake_amount.toFixed(2)}` : `To Win:$${bet.potential_payout.toFixed(2)}`}</p>
                                </div>
                            </div>
                            <div className="mt-4 space-y-2.5 border-t border-sleeper-border pt-3">
                                {bet.user_bet_selections.map((sel, index) => {
                                    const availableBetData = sel.available_bet;

                                    if (!availableBetData || !availableBetData.bet_type || !availableBetData.game) {
                                        return <div key={index} className="text-xs text-sleeper-error p-2">Selection
                                            details corrupt or missing.</div>;
                                    }

                                    const decimalOddsTaken = americanToDecimal(sel.odds_at_placement);
                                    const marketKey = availableBetData.bet_type.api_market_key;
                                    const selectionName = availableBetData.selection_name;
                                    const betTypeName = availableBetData.bet_type.name;
                                    const line = availableBetData.line;
                                    const gameInfo = availableBetData.game;

                                    const statUnit = marketKey ? getStatUnit(marketKey) : '';
                                    const isSettledActual = bet.status !== 'pending' && sel.actual_stat_value_at_settlement !== null && sel.actual_stat_value_at_settlement !== undefined;

                                    return (<div key={index}
                                                 className="ml-0 sm:ml-2 p-3 bg-sleeper-surface-200/80 rounded text-sm shadow-sm border border-sleeper-border/30">
                                        <p className="text-sleeper-text-primary font-medium">{selectionName}<span
                                            className="text-sleeper-text-secondary text-xs ml-2">({betTypeName})</span>
                                        </p>
                                        <p className="text-sleeper-interactive font-medium">Odds
                                            Taken: {decimalOddsTaken.toFixed(2)}{line !== null && ` (Line:${line > 0 ? `+${line.toFixed(1)}` : line.toFixed(1)})`}</p>
                                        <p className="text-xs text-sleeper-text-secondary mt-1">{gameInfo.away_team} @ {gameInfo.home_team}<span
                                            className="text-sleeper-text-secondary/70">({new Date(gameInfo.game_time).toLocaleDateString()})</span>
                                        </p>
                                        {isSettledActual && (
                                            <p className="text-xs text-sleeper-accent mt-1 font-semibold">Actual:{sel.actual_stat_value_at_settlement}{statUnit}</p>)}
                                        {bet.status !== 'pending' && gameInfo.home_score != null && gameInfo.away_score != null ? (
                                            <p className="text-xs text-sleeper-text-secondary mt-1">Final
                                                Score:{gameInfo.away_score ?? '-'} - {gameInfo.home_score ?? '-'}</p>) : null}
                                    </div>);
                                })}
                            </div>
                        </div>);
                    })}
                </div>
            )}
        </div>
    );
};
export default BetHistoryPage;