// frontend/src/components/GameList.tsx
import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { Link } from 'react-router-dom';
import { useDashboardOutletContext } from '../App'; // Corrected import for the context hook

// Types defined here or imported from a shared types file
// This BetType is minimal, matching the !inner join
export interface BetTypeSummary {
    name: string;
    api_market_key: string;
}

// This type represents the structure of bets fetched for the GameList summary
export interface GameListSummaryBet {
    id: number;
    selection_name: string;
    odds: number;
    line: number | null;
    is_active: boolean; // Added for completeness
    bet_types: BetTypeSummary; // Changed from 'bet_type' to 'bet_types' to match typical Supabase join alias
    // This is added client-side when preparing the bet for the addToBetSlip handler
    game_info_for_slip: {
        id: number; // db game id
        api_game_id: string;
        home_team: string;
        away_team: string;
        game_time: string;
    };
}

export interface GameForList {
    id: number; // Database ID
    api_game_id: string;
    home_team: string;
    away_team: string;
    game_time: string;
    status: string;
    home_score?: number | null;
    away_score?: number | null;
    available_bets: GameListSummaryBet[]; // Uses the GameListSummaryBet type
}

const GameList: React.FC = () => {
    const { addToBetSlip, isOddInBetSlip } = useDashboardOutletContext(); // Consume context
    const [games, setGames] = useState<GameForList[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchGamesSummary = async () => {
            setLoading(true);
            setError(null);
            try {
                const { data: fetchedGamesData, error: gamesError } = await supabase
                    .from('games')
                    .select(`
                        id, api_game_id, home_team, away_team, game_time, status, home_score, away_score,
                        available_bets!inner (
                            id, selection_name, odds, line, is_active,
                            bet_types!inner (name, api_market_key)
                        )
                    `)
                    .in('status', ['scheduled', 'live', 'inplay', 'active', 'pending_completion']) // Broader statuses
                    .eq('available_bets.is_active', true) // Ensure bets are active
                    .order('game_time', { ascending: true })
                    .limit(30); // Fetch a reasonable number of games

                if (gamesError) throw gamesError;

                if (!fetchedGamesData || fetchedGamesData.length === 0) {
                    setGames([]);
                } else {
                    // Process fetched data
                    const gamesWithKeyOdds = fetchedGamesData.map(game => {
                        // Ensure available_bets is an array and map over it
                        const betsWithContext = (game.available_bets || []).map((bet: any) => ({
                            ...bet, // Spread the original bet properties
                            bet_types: bet.bet_types, // Keep the nested bet_types object
                            game_info_for_slip: { // Add game context
                                id: game.id,
                                api_game_id: game.api_game_id,
                                home_team: game.home_team,
                                away_team: game.away_team,
                                game_time: game.game_time,
                            }
                        }));

                        // Filter for summary display (e.g., moneyline 'h2h')
                        const summaryBets = betsWithContext.filter(
                            (bet: GameListSummaryBet) => bet.bet_types.api_market_key === 'h2h'
                        ).slice(0, 2); // Show up to 2 moneyline odds

                        return { ...game, available_bets: summaryBets };
                    }).filter(game => game.available_bets.length > 0); // Only show games with these summary bets

                    setGames(gamesWithKeyOdds as GameForList[]);
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
            <p className="text-sleeper-text-secondary">No upcoming NFL games with key odds available right now.</p>
        </div>
    );

    return (
        <div className="space-y-4">
            {games.map((game) => {
                const gameDate = new Date(game.game_time);
                const isLive = game.status.toLowerCase().includes('live') || game.status.toLowerCase().includes('inplay');
                const isFinal = game.status.toLowerCase().includes('final') || game.status.toLowerCase().includes('completed');

                return (
                    <div
                        key={game.id}
                        className="block bg-sleeper-surface border border-sleeper-border rounded-xl shadow-lg hover:border-sleeper-primary transition-all duration-200 group"
                    >
                        <Link to={`/game/${game.id}`} className="block p-4"> {/* Links to /game/:dbGameId */}
                            <div className="flex flex-col sm:flex-row justify-between items-start ">
                                <div className="mb-2 sm:mb-0 flex-grow">
                                    <h3 className="text-lg font-bold text-sleeper-primary group-hover:text-sleeper-accent transition-colors">
                                        {game.away_team} <span className="text-sleeper-text-secondary text-base font-normal">@</span> {game.home_team}
                                    </h3>
                                    <p className="text-xs text-sleeper-text-secondary mt-1">
                                        {gameDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                                        <span className="mx-1.5">·</span>
                                        {gameDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}
                                        {isLive && <span className="ml-2 px-2 py-0.5 text-xs font-semibold text-red-100 bg-red-600 rounded-full animate-pulse">LIVE</span>}
                                    </p>
                                    {isFinal && game.home_score != null && game.away_score != null && (
                                        <p className="text-sm font-medium text-white mt-1">
                                            Final: {game.away_team} {game.away_score} - {game.home_team} {game.home_score}
                                        </p>
                                    )}
                                </div>
                                <div className="flex space-x-2 mt-2 sm:mt-0 sm:items-center flex-shrink-0">
                                    {game.available_bets.map((bet) => (
                                        <button
                                            key={`quick-${bet.id}`}
                                            className={`px-3 py-1.5 rounded-md text-xs font-semibold border transition-colors
                                            ${isOddInBetSlip(bet.id) ? 'bg-sleeper-accent text-white border-sleeper-accent' : 'bg-sleeper-bg-secondary text-sleeper-text-primary border-sleeper-border hover:border-sleeper-interactive hover:bg-sleeper-tertiary'}`}
                                            onClick={(e) => {
                                                e.preventDefault(); e.stopPropagation();
                                                addToBetSlip(bet, true); // Pass the whole 'bet' (GameListSummaryBet) object
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