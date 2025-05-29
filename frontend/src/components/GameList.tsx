// frontend/src/components/GameList.tsx
import React, {useEffect, useState} from 'react';
import {supabase} from '../supabaseClient';
import {Link} from 'react-router-dom';
import {useDashboardOutletContext} from '../App';
import {americanToDecimal} from '../utils/oddsConverter';
import {CalendarDaysIcon, ExclamationTriangleIcon} from '@heroicons/react/24/outline';
import {toast} from 'react-toastify'; // Import toast

export interface BetTypeSummary {
    name: string;
    api_market_key: string;
}

// This type represents bets passed to addToBetSlip from GameList
export interface GameListSummaryBet {
    id: number;
    selection_name: string;
    odds: number; // American Odd
    line: number | null;
    is_active: boolean;
    bet_type: BetTypeSummary; // Changed from bet_types to bet_type (singular object)
    game_info_for_slip: {
        id: number;
        api_game_id: string;
        home_team: string;
        away_team: string;
        game_time: string;
    };
}

export interface GameForList {
    id: number;
    api_game_id: string;
    home_team: string;
    away_team: string;
    game_time: string;
    status: string;
    home_score?: number | null;
    away_score?: number | null;
    available_bets: GameListSummaryBet[];
}

const GameList: React.FC = () => {
    const {addToBetSlip, removeFromBetSlip, isOddInBetSlip} = useDashboardOutletContext();
    const [games, setGames] = useState<GameForList[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchGamesSummary = async () => {
            setLoading(true);
            setError(null);
            try {
                const {data: fetchedGamesData, error: gamesError} = await supabase
                    .from('games')
                    .select(`
                        id, api_game_id, home_team, away_team, game_time, status, home_score, away_score,
                        available_bets!inner (
                            id, selection_name, odds, line, is_active,
                            bet_type:bet_types!inner (name, api_market_key) 
                        )
                    `)
                    .in('status', ['scheduled', 'live', 'inplay', 'active', 'pending_completion'])
                    .eq('available_bets.is_active', true)
                    .order('game_time', {ascending: true})
                    .limit(30);

                if (gamesError) throw gamesError;

                if (!fetchedGamesData || fetchedGamesData.length === 0) {
                    setGames([]);
                } else {
                    const gamesWithKeyOdds = fetchedGamesData.map(game => {
                        const betsWithContext = (game.available_bets || []).map((betFromSupabase: any) => {
                            return {
                                id: betFromSupabase.id,
                                selection_name: betFromSupabase.selection_name,
                                odds: betFromSupabase.odds,
                                line: betFromSupabase.line,
                                is_active: betFromSupabase.is_active,
                                bet_type: betFromSupabase.bet_type as BetTypeSummary, // Use the aliased bet_type (singular)
                                game_info_for_slip: {
                                    id: game.id, api_game_id: game.api_game_id,
                                    home_team: game.home_team, away_team: game.away_team,
                                    game_time: game.game_time,
                                }
                            };
                        });
                        // Ensure bet_type exists before accessing api_market_key
                        const summaryBets = betsWithContext.filter(
                            (bet: GameListSummaryBet) => bet.bet_type?.api_market_key === 'h2h'
                        ).slice(0, 2);
                        return {...game, available_bets: summaryBets};
                    }).filter(game => game.available_bets.length > 0);
                    setGames(gamesWithKeyOdds as GameForList[]);
                }
            } catch (err: any) {
                console.error("Error GameList:", err);
                setError(err.message || "Failed load.");
                setGames([]);
            } finally {
                setLoading(false);
            }
        };
        fetchGamesSummary();
    }, []);

    const handleQuickBetToggle = (bet: GameListSummaryBet) => {
        if (!bet.is_active && !isOddInBetSlip(bet.id)) {
            toast.warn("This betting option is no longer active.");
            return;
        }
        if (isOddInBetSlip(bet.id)) {
            removeFromBetSlip(bet.id);
        } else {
            addToBetSlip(bet, true);
        }
    };

    if (loading) return <div className="flex flex-col justify-center items-center min-h-[300px] text-center p-6">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sleeper-primary mb-4"></div>
        <p className="text-sleeper-text-secondary text-lg">Loading Games...</p></div>;
    if (error) return <div
        className="flex flex-col justify-center items-center min-h-[300px] text-center p-6 bg-sleeper-surface-100 rounded-xl shadow-lg border border-sleeper-error">
        <ExclamationTriangleIcon className="h-16 w-16 text-sleeper-error opacity-80 mb-4"/><h3
        className="text-xl font-semibold text-sleeper-error mb-1">Error Loading Games</h3><p
        className="text-sleeper-text-secondary">{error}</p></div>;
    if (games.length === 0) return (<div
        className="flex flex-col justify-center items-center min-h-[300px] text-center p-6 bg-sleeper-surface-100 rounded-xl shadow-lg border border-sleeper-border">
        <CalendarDaysIcon className="h-16 w-16 text-sleeper-text-secondary opacity-50 mb-4"/><h3
        className="text-xl font-semibold text-sleeper-text-primary mb-1">No Games Available</h3><p
        className="text-sleeper-text-secondary">There are no upcoming NFL games with available odds right now.</p>
    </div>);

    return (
        <div className="space-y-4 md:space-y-6">
            {games.map((game) => {
                const gameDate = new Date(game.game_time);
                const isLive = game.status.toLowerCase().includes('live') || game.status.toLowerCase().includes('inplay');
                const isFinal = game.status.toLowerCase().includes('final') || game.status.toLowerCase().includes('completed');
                return (
                    <div key={game.id}
                         className="block bg-sleeper-surface-100 border border-sleeper-border rounded-xl shadow-lg hover:border-sleeper-primary hover:shadow-xl transition-all group">
                        <Link to={`/game/${game.id}`} className="block p-4 sm:p-5">
                            <div className="flex flex-col sm:flex-row justify-between items-start ">
                                <div className="mb-3 sm:mb-0 flex-grow"><h3
                                    className="text-lg sm:text-xl font-bold text-sleeper-text-primary group-hover:text-sleeper-primary">{game.away_team}
                                    <span className="text-sleeper-text-secondary text-base">@</span> {game.home_team}
                                </h3><p
                                    className="text-xs text-sleeper-text-secondary mt-1">{gameDate.toLocaleDateString(undefined, {
                                    weekday: 'short',
                                    month: 'short',
                                    day: 'numeric'
                                })}<span
                                    className="mx-1.5 text-sleeper-border">·</span>{gameDate.toLocaleTimeString([], {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                    hour12: true
                                })}{isLive && <span
                                    className="ml-3 px-2.5 py-1 text-xs font-bold text-white bg-red-600 rounded-full animate-pulse">LIVE</span>}
                                </p>{isFinal && game.home_score != null && game.away_score != null && (
                                    <p className="text-sm font-semibold text-sleeper-text-primary mt-1.5">Final: <span
                                        className="text-sleeper-accent">{game.away_team} {game.away_score}</span> - <span
                                        className="text-sleeper-accent">{game.home_team} {game.home_score}</span></p>)}
                                </div>
                                <div className="flex space-x-2 mt-2 sm:mt-0 sm:items-center flex-shrink-0">
                                    {game.available_bets.map((bet) => {
                                        const decimalOddForDisplay = americanToDecimal(bet.odds);
                                        const isSelected = isOddInBetSlip(bet.id);
                                        return (
                                            <button key={`quick-${bet.id}`}
                                                    className={`px-3 py-2 rounded-lg text-xs font-semibold border transition-all w-[90px] sm:w-[100px] h-16 flex flex-col justify-center items-center shadow-sm hover:shadow-md ${isSelected ? 'bg-sleeper-accent text-sleeper-text-on-accent border-sleeper-accent-hover ring-2 ring-offset-2 ring-offset-sleeper-surface-100 ring-sleeper-accent' : 'bg-sleeper-surface-200 text-sleeper-text-primary border-sleeper-border hover:border-sleeper-primary hover:bg-sleeper-primary hover:text-sleeper-text-on-primary'}`}
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        handleQuickBetToggle(bet);
                                                    }}
                                                    title={`${isSelected ? 'Remove from slip' : 'Quick Bet'}: ${bet.selection_name}`}>
                                                <span
                                                    className="block truncate w-full text-center text-xs">{bet.selection_name.replace(game.home_team, 'Home').replace(game.away_team, 'Away')}</span>
                                                <span
                                                    className="block text-center font-bold text-sm mt-0.5">{decimalOddForDisplay.toFixed(2)}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </Link>
                    </div>
                );
            })}
        </div>
    );
};
export default GameList;