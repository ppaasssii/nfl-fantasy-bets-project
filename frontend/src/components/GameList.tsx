// src/components/GameList.tsx
import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { Link } from 'react-router-dom';
import { useDashboardContext } from '../App'; // Use the context from DashboardLayout

export interface BetType {
    id: number;
    name: string;
    api_market_key: string;
}

export interface AvailableBetWithBetType {
    id: number;
    game_id: number;
    bet_type_id: number;
    selection_name: string;
    odds: number;
    line: number | null;
    is_active: boolean;
    source_bookmaker: string | null;
    bet_types: Pick<BetType, 'name' | 'api_market_key'>;
    games?: { id: number; home_team: string; away_team: string; game_time: string; };
}

export interface Game {
    id: number;
    api_game_id: string;
    home_team: string;
    away_team: string;
    game_time: string;
    status: string;
    // For summary, we might only fetch a few key bets or all and filter client-side
    available_bets: Pick<AvailableBetWithBetType, 'id' | 'selection_name' | 'odds' | 'line' | 'bet_types' | 'games'>[];
}

const GameList: React.FC = () => {
    const { onSelectBet, selectedBetIds } = useDashboardContext(); // Use context from DashboardLayout
    const [games, setGames] = useState<Game[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchGamesSummary = async () => {
            setLoading(true);
            setError(null);
            try {
                // Fetch games and a limited set of their main market bets for summary display
                const { data: scheduledGames, error: gamesError } = await supabase
                    .from('games')
                    .select(`
                        id, api_game_id, home_team, away_team, game_time, status,
                        available_bets!inner (
                            id, selection_name, odds, line, 
                            bet_types!inner (name, api_market_key)
                        )
                    `)
                    .eq('status', 'scheduled')
                    .eq('available_bets.is_active', true)
                    .order('game_time', { ascending: true })
                    .limit(25); // Fetch more games initially

                if (gamesError) throw gamesError;

                if (!scheduledGames || scheduledGames.length === 0) {
                    setGames([]);
                } else {
                    const gamesWithKeyOdds = scheduledGames.map(game => {
                        // Directly attach full game context to each bet for the onSelectBet handler
                        const betsWithFullGameContext = game.available_bets.map((bet: any) => ({
                            ...bet,
                            games: { // Ensure this 'games' structure matches what onSelectBetForSlip expects
                                id: game.id,
                                home_team: game.home_team,
                                away_team: game.away_team,
                                game_time: game.game_time,
                            }
                        }));

                        // For summary, filter to show only main market moneyline bets if desired, or keep it flexible
                        const summaryBets = betsWithFullGameContext.filter(
                            (bet: AvailableBetWithBetType) => ['h2h'].includes(bet.bet_types.api_market_key)
                        ).slice(0, 2); // Show up to 2 moneyline odds for summary

                        return { ...game, available_bets: summaryBets };
                    }).filter(game => game.available_bets.length > 0); // Only show games that have at least these summary bets

                    setGames(gamesWithKeyOdds as Game[]);
                }
            } catch (err: any) {
                console.error("Error fetching games summary in GameList:", err);
                setError(err.message || "Failed to load games.");
                setGames([]);
            } finally {
                setLoading(false);
            }
        };

        fetchGamesSummary();
    }, []);

    if (loading) return <div className="flex justify-center items-center h-40"><p className="text-sleeper-text-secondary">Loading games...</p></div>;
    if (error) return <div className="flex justify-center items-center h-40"><p className="text-sleeper-error text-center">{error}</p></div>;
    if (games.length === 0) return (
        <div className="flex flex-col justify-center items-center h-40 text-center p-4">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-sleeper-text-secondary opacity-50 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sleeper-text-secondary">No scheduled NFL games with odds available right now.</p>
        </div>
    );

    return (
        <div className="space-y-4">
            {games.map((game) => {
                const gameDate = new Date(game.game_time);

                return (
                    <div
                        key={game.id}
                        className="block bg-sleeper-surface border border-sleeper-border rounded-xl shadow-lg hover:border-sleeper-primary transition-all duration-200 group"
                    >
                        <Link to={`/game/${game.id}`} className="block p-4">
                            <div className="flex flex-col sm:flex-row justify-between items-start ">
                                <div className="mb-2 sm:mb-0 flex-grow">
                                    <h3 className="text-lg font-bold text-sleeper-primary group-hover:text-sleeper-accent transition-colors">
                                        {game.away_team} <span className="text-sleeper-text-secondary text-base font-normal">@</span> {game.home_team}
                                    </h3>
                                    <p className="text-xs text-sleeper-text-secondary mt-1">
                                        {gameDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                                        <span className="mx-1.5">·</span>
                                        {gameDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}
                                    </p>
                                </div>
                                {/* Quick add buttons for main moneyline from the list view */}
                                <div className="flex space-x-2 mt-2 sm:mt-0 sm:items-center flex-shrink-0">
                                    {game.available_bets.map((bet: AvailableBetWithBetType) => (
                                        <button
                                            key={`quick-${bet.id}`}
                                            className={`px-3 py-1.5 rounded-md text-xs font-semibold border
                                            ${selectedBetIds.includes(bet.id) ? 'bg-sleeper-accent text-white border-sleeper-accent' : 'bg-sleeper-bg-secondary text-sleeper-text-primary border-sleeper-border hover:border-sleeper-interactive'}`}
                                            onClick={(e) => {
                                                e.preventDefault(); // Prevent link navigation
                                                e.stopPropagation(); // Stop event bubbling
                                                onSelectBet(bet, true); // Pass true for isQuickBet
                                            }}
                                            title={`Quick Bet: ${bet.selection_name}`}
                                        >
                                            <span className="block truncate max-w-[80px] sm:max-w-[100px]">{bet.selection_name.replace(game.home_team, 'H').replace(game.away_team, 'A')}</span>
                                            <span className="block text-center">{bet.odds.toFixed(2)}</span>
                                        </button>
                                    ))}
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