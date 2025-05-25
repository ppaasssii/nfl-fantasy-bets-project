// frontend/src/components/BetHistoryPage.tsx
import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '../supabaseClient';
import { useAuthContext } from '../App';
import { toast } from 'react-toastify';
import { americanToDecimal } from '../utils/oddsConverter'; // Import the converter

interface BetHistorySelectionDisplay {
    odds_at_placement: number; // This is stored as American odd
    available_bets: {
        selection_name: string;
        line: number | null;
        bet_types: { name: string; };
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
    total_odds: number; // This is stored as Decimal odd by the latest place-bet function
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
                            available_bets (
                               selection_name, line,
                               bet_types (name),
                               games (home_team, away_team, game_time, home_score, away_score)
                            )
                        )
                    `)
                    .eq('user_id', session.user.id)
                    .order('placed_at', { ascending: false })
                    .limit(100);
                if (fetchError) throw fetchError;
                setAllBets((data as BetHistoryItemDisplay[]) || []);
            } catch (err: any) { console.error("Error fetching bet history:", err); toast.error(err.message || "Failed to load bet history."); setAllBets([]);
            } finally { setLoading(false); }
        };
        fetchBetHistory();
    }, [session]);

    const displayedBets = useMemo(() => {
        let filtered = [...allBets];
        if (statusFilter !== 'all') filtered = filtered.filter(bet => bet.status === statusFilter);
        switch (sortBy) {
            case 'stake_asc': filtered.sort((a, b) => a.stake_amount - b.stake_amount); break;
            case 'stake_desc': filtered.sort((a, b) => b.stake_amount - a.stake_amount); break;
            case 'placed_at_asc': filtered.sort((a, b) => new Date(a.placed_at).getTime() - new Date(b.placed_at).getTime()); break;
            default: filtered.sort((a, b) => new Date(b.placed_at).getTime() - new Date(a.placed_at).getTime()); break;
        }
        return filtered;
    }, [allBets, statusFilter, sortBy]);

    if (loading) return (<div className="flex justify-center items-center h-60 p-4 bg-sleeper-surface rounded-lg shadow-xl"><p className="text-sleeper-text-secondary text-lg">Loading bet history...</p></div>);
    if (!session && !loading) return (<div className="p-4 sm:p-6 bg-sleeper-bg-secondary rounded-xl shadow-2xl text-center"><h1 className="text-2xl sm:text-3xl font-bold text-sleeper-primary mb-3 sm:mb-0">Your Bet History</h1><p className="text-sleeper-text-secondary mt-4">Please log in.</p></div>);

    return (
        <div className="p-4 sm:p-6 bg-sleeper-bg-secondary rounded-xl shadow-2xl">
            <div className="flex flex-col sm:flex-row justify-between items-center mb-6 pb-4 border-b border-sleeper-border">
                <h1 className="text-2xl sm:text-3xl font-bold text-sleeper-primary mb-3 sm:mb-0">Your Bet History</h1>
                <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 w-full sm:w-auto">
                    <div><label htmlFor="statusFilter" className="block text-xs font-medium text-sleeper-text-secondary mb-0.5">Filter</label><select id="statusFilter" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="block w-full sm:w-auto pl-3 pr-10 py-2 text-sm bg-sleeper-surface border-sleeper-border rounded-md focus:ring-sleeper-primary text-sleeper-text-primary"><option value="all">All</option><option value="pending">Pending</option><option value="won">Won</option><option value="lost">Lost</option><option value="void">Void</option></select></div>
                    <div><label htmlFor="sortBy" className="block text-xs font-medium text-sleeper-text-secondary mb-0.5">Sort</label><select id="sortBy" value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="block w-full sm:w-auto pl-3 pr-10 py-2 text-sm bg-sleeper-surface border-sleeper-border rounded-md focus:ring-sleeper-primary text-sleeper-text-primary"><option value="placed_at_desc">Newest</option><option value="placed_at_asc">Oldest</option><option value="stake_desc">Stake (High-Low)</option><option value="stake_asc">Stake (Low-High)</option></select></div>
                </div>
            </div>
            {displayedBets.length === 0 && !loading ? (
                <div className="text-center py-12 bg-sleeper-surface rounded-lg shadow"><svg className="mx-auto h-16 w-16 text-sleeper-text-secondary opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" /></svg><h3 className="mt-3 text-lg font-medium text-sleeper-text-primary">No Bets Found</h3><p className="mt-1 text-sm text-sleeper-text-secondary">Adjust filters or place new bets!</p></div>
            ) : (
                <div className="space-y-6">
                    {displayedBets.map((bet) => {
                        let statusClasses = 'border-sleeper-primary bg-sleeper-surface hover:bg-opacity-80'; let statusTextClass = 'text-sleeper-primary';
                        if (bet.status === 'won') { statusClasses = 'border-sleeper-success bg-sleeper-success/10 hover:bg-sleeper-success/20'; statusTextClass = 'text-sleeper-success';}
                        else if (bet.status === 'lost') { statusClasses = 'border-sleeper-error bg-sleeper-error/10 hover:bg-sleeper-error/20'; statusTextClass = 'text-sleeper-error';}
                        else if (bet.status === 'void') { statusClasses = 'border-sleeper-warning bg-sleeper-warning/10 hover:bg-sleeper-warning/20'; statusTextClass = 'text-sleeper-warning';}
                        return (
                            <div key={bet.id} className={`p-4 rounded-lg shadow-lg border-l-4 ${statusClasses}`}>
                                <div className="flex flex-col sm:flex-row justify-between items-start mb-3">
                                    <div className="mb-2 sm:mb-0 flex-grow"><p className="text-xs text-sleeper-text-secondary mb-1">ID: {bet.id} | Placed: {new Date(bet.placed_at).toLocaleString([],{year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}</p><p className="text-lg font-semibold capitalize text-sleeper-text-primary">{bet.bet_type} Bet - <span className={`font-bold ${statusTextClass}`}>{bet.status.toUpperCase()}</span></p></div>
                                    <div className="text-left sm:text-right w-full sm:w-auto mt-2 sm:mt-0 bg-sleeper-surface/80 p-3 rounded-md shadow-inner">
                                        <p className="text-sm text-sleeper-text-secondary">Stake: <span className="font-semibold text-sleeper-text-primary">${bet.stake_amount.toFixed(2)}</span></p>
                                        {/* Display total_odds (which is stored as Decimal) */}
                                        <p className="text-sm text-sleeper-text-secondary">Odds: <span className="font-semibold text-sleeper-text-primary">{bet.total_odds.toFixed(2)}</span></p>
                                        <p className={`text-md font-semibold ${bet.status==='won'?statusTextClass:bet.status==='void'?'text-sleeper-warning':'text-sleeper-text-primary'}`}>
                                            {bet.status === 'won' ? `Won: $${bet.potential_payout.toFixed(2)}` : bet.status === 'void' ? `Refund: $${bet.stake_amount.toFixed(2)}` : `To Win: $${bet.potential_payout.toFixed(2)}`}
                                        </p>
                                    </div>
                                </div>
                                <div className="mt-3 space-y-2">
                                    {bet.user_bet_selections.map((sel, index) => {
                                        // Convert stored American odd to Decimal for display
                                        const decimalOddsTaken = americanToDecimal(sel.odds_at_placement);
                                        return (
                                            <div key={index} className="ml-0 sm:ml-2 p-3 bg-sleeper-surface/50 rounded text-sm shadow">
                                                <p className="text-sleeper-text-primary font-medium">{sel.available_bets.selection_name}<span className="text-sleeper-text-secondary text-xs ml-2">({sel.available_bets.bet_types.name})</span></p>
                                                {/* Display Decimal Odds Taken */}
                                                <p className="text-indigo-300">Odds Taken: {decimalOddsTaken.toFixed(2)}{sel.available_bets.line !== null && ` (Line: ${sel.available_bets.line > 0 ? `+${sel.available_bets.line.toFixed(1)}` : sel.available_bets.line.toFixed(1)})`}</p>
                                                <p className="text-xs text-sleeper-text-secondary mt-1">Game: {sel.available_bets.games.away_team} @ {sel.available_bets.games.home_team}<span className="text-gray-500"> ({new Date(sel.available_bets.games.game_time).toLocaleDateString()})</span></p>
                                                {(bet.status === 'won' || bet.status === 'lost' || bet.status === 'void') && (sel.available_bets.games.home_score != null && sel.available_bets.games.away_score != null) ? (<p className="text-xs text-sleeper-text-secondary mt-1">Final: {sel.available_bets.games.away_score ?? '-'} - {sel.available_bets.games.home_score ?? '-'}</p>): null}
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