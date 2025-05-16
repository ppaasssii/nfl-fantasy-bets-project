// File: frontend/src/components/GameDetailPage.tsx

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams, Link, useOutletContext } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { toast } from 'react-toastify';
import { Disclosure } from '@headlessui/react';
import { ChevronUpIcon, ArrowLeftIcon } from '@heroicons/react/20/solid'; // Assuming you use Heroicons

// Types (ensure these align with your global types or define them here if not already)
interface Game {
    id: number;
    api_game_id: string;
    home_team: string;
    away_team: string;
    game_time: string;
    status: string;
    home_score?: number;
    away_score?: number;
}

interface BetType {
    id: number;
    name: string;
    api_market_key: string;
    description?: string;
}

interface AvailableBet {
    id: number;
    game_id: number;
    bet_type_id: number;
    selection_name: string;
    odds: number;
    line?: number;
    is_active: boolean;
    is_winning_outcome?: boolean;
    source_bookmaker?: string;
    api_last_update?: string;
    bet_type?: BetType; // Joined data
}

interface BetSelection {
    odd: AvailableBet;
    // any other properties for a selection if needed
}

// For context passed from DashboardLayout
interface DashboardLayoutContext {
    session: any; // Replace 'any' with your actual Session type from Supabase
    betSlip: BetSelection[];
    addToBetSlip: (odd: AvailableBet) => void;
    removeFromBetSlip: (oddId: number) => void;
    isOddInBetSlip: (oddId: number) => boolean;
}


function GameDetailPage() {
    const { gameApiId } = useParams<{ gameApiId: string }>();
    const [game, setGame] = useState<Game | null>(null);
    const [oddsData, setOddsData] = useState<AvailableBet[] | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const { addToBetSlip, isOddInBetSlip } = useOutletContext<DashboardLayoutContext>();

    const fetchGameDetails = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            // Fetch game details
            const { data: gameDetails, error: gameError } = await supabase
                .from('games')
                .select('*')
                .eq('api_game_id', gameApiId)
                .single();

            if (gameError) throw gameError;
            if (!gameDetails) throw new Error('Game not found.');
            setGame(gameDetails);

            // Fetch odds for this game, joining with bet_types
            const { data: fetchedOdds, error: oddsError } = await supabase
                .from('available_bets')
                .select(`
                    *,
                    bet_type:bet_types(id, name, api_market_key, description)
                `)
                .eq('game_id', gameDetails.id)
                .eq('is_active', true) // Only fetch active odds
                .order('bet_type_id', { ascending: true })
                .order('line', { ascending: true, nullsFirst: true })
                .order('selection_name', { ascending: true });


            if (oddsError) throw oddsError;
            setOddsData(fetchedOdds as AvailableBet[]);

        } catch (err) {
            console.error('Error fetching game details or odds:', err);
            const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
            setError(errorMessage);
            toast.error(`Failed to load game data: ${errorMessage}`);
        } finally {
            setLoading(false);
        }
    }, [gameApiId]);

    useEffect(() => {
        if (gameApiId) {
            fetchGameDetails();
        }
    }, [gameApiId, fetchGameDetails]);

    const handleOddSelect = (odd: AvailableBet) => {
        if (!isOddInBetSlip(odd.id) && odd.is_active) {
            addToBetSlip(odd);
            toast.success(`${odd.selection_name} (${odd.odds.toFixed(2)}) added to slip!`);
        } else if (!odd.is_active) {
            toast.warn('This bet is no longer active.');
        } else {
            toast.info('This bet is already in your slip.');
        }
    };

    const categorizedOdds = useMemo(() => {
        if (!oddsData) return {};

        const categories: Record<string, AvailableBet[]> = {
            'Game Lines': [],
            'Team Totals': [],
            'Passing Props': [],
            'Rushing Props': [],
            'Receiving Props': [],
            'Touchdown Props': [],
            'Fantasy Score Props': [],
            'Other Player Props': [],
            '1st Quarter': [],
            '2nd Quarter': [],
            '1st Half': [],
            '3rd Quarter': [],
            '4th Quarter': [],
            '2nd Half': [],
            'Game Props': [],
            'Other Bets': [],
        };

        const categoryOrder = [
            'Game Lines', 'Team Totals',
            '1st Quarter', '2nd Quarter', '1st Half',
            '3rd Quarter', '4th Quarter', '2nd Half',
            'Passing Props', 'Rushing Props', 'Receiving Props', 'Touchdown Props', 'Fantasy Score Props', 'Other Player Props',
            'Game Props', 'Other Bets'
        ];

        oddsData.forEach((odd) => {
            const betTypeApiMarketKey = odd.bet_type?.api_market_key?.toLowerCase() || 'unknown';
            let assignedCategory = 'Other Bets';

            if (['h2h', 'spreads', 'totals'].includes(betTypeApiMarketKey)) {
                assignedCategory = 'Game Lines';
            } else if (['team_points_home_ou', 'team_points_away_ou'].includes(betTypeApiMarketKey)) {
                assignedCategory = 'Team Totals';
            } else if (betTypeApiMarketKey.startsWith('player_')) {
                if (betTypeApiMarketKey.includes('passing')) assignedCategory = 'Passing Props';
                else if (betTypeApiMarketKey.includes('rushing')) assignedCategory = 'Rushing Props';
                else if (betTypeApiMarketKey.includes('receiving')) assignedCategory = 'Receiving Props';
                else if (betTypeApiMarketKey.includes('touchdown')) assignedCategory = 'Touchdown Props';
                else if (betTypeApiMarketKey.includes('fantasyscore')) assignedCategory = 'Fantasy Score Props'; // Matched your log
                else assignedCategory = 'Other Player Props';
            } else if (betTypeApiMarketKey.startsWith('1q_')) {
                assignedCategory = '1st Quarter';
            } else if (betTypeApiMarketKey.startsWith('2q_')) {
                assignedCategory = '2nd Quarter';
            } else if (betTypeApiMarketKey.startsWith('1h_')) {
                assignedCategory = '1st Half';
            } else if (betTypeApiMarketKey.startsWith('3q_')) {
                assignedCategory = '3rd Quarter';
            } else if (betTypeApiMarketKey.startsWith('4q_')) {
                assignedCategory = '4th Quarter';
            } else if (betTypeApiMarketKey.startsWith('2h_')) {
                assignedCategory = '2nd Half';
            } else if (['game_total_eo', 'team_points_home_eo', 'team_points_away_eo', 'reg_ml3way', 'reg_double_chance'].includes(betTypeApiMarketKey)) {
                assignedCategory = 'Game Props';
            }

            if (!categories[assignedCategory]) {
                categories[assignedCategory] = [];
            }
            categories[assignedCategory].push(odd);
        });

        const orderedCategorizedOdds: Record<string, AvailableBet[]> = {};
        for (const categoryName of categoryOrder) {
            if (categories[categoryName] && categories[categoryName].length > 0) {
                orderedCategorizedOdds[categoryName] = categories[categoryName];
            }
        }
        for (const categoryName in categories) { // Add any stragglers not in predefined order
            if (categories[categoryName].length > 0 && !orderedCategorizedOdds[categoryName]) {
                orderedCategorizedOdds[categoryName] = categories[categoryName];
            }
        }
        return orderedCategorizedOdds;
    }, [oddsData]);


    if (loading) return <div className="text-center py-10 text-xl text-sleeper-accent">Loading game details...</div>;
    if (error) return <div className="text-center py-10 text-xl text-red-500">Error: {error}</div>;
    if (!game) return <div className="text-center py-10 text-xl">Game not found.</div>;

    const gameDate = new Date(game.game_time);
    const formattedDate = `${gameDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} - ${gameDate.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: true })}`;

    return (
        <div className="container mx-auto px-2 sm:px-4 py-6 text-sleeper-text-primary">
            <Link to="/dashboard/games" className="inline-flex items-center mb-4 text-sleeper-accent hover:text-sleeper-accent-light transition-colors">
                <ArrowLeftIcon className="h-5 w-5 mr-2" />
                Back to Games
            </Link>

            <div className="bg-sleeper-secondary p-4 sm:p-6 rounded-lg shadow-xl mb-6">
                <div className="flex flex-col sm:flex-row justify-between items-center mb-2">
                    <h1 className="text-2xl sm:text-3xl font-bold text-sleeper-text-primary truncate">
                        {game.away_team} @ {game.home_team}
                    </h1>
                    <span className="text-sm text-gray-400 mt-1 sm:mt-0">{formattedDate}</span>
                </div>
                {game.status === 'completed' && game.home_score !== null && game.away_score !== null && (
                    <p className="text-xl font-semibold text-sleeper-accent text-center sm:text-right">
                        Final Score: {game.away_team} {game.away_score} - {game.home_team} {game.home_score}
                    </p>
                )}
                {game.status !== 'completed' && (
                    <p className="text-md text-gray-400 text-center sm:text-right capitalize">
                        Status: {game.status}
                    </p>
                )}
            </div>

            {!oddsData || oddsData.length === 0 ? (
                <p className="text-center text-lg text-gray-400 py-8">No active odds available for this game at the moment.</p>
            ) : (
                <div className="space-y-3">
                    {Object.entries(categorizedOdds).map(([categoryName, oddsList]) => {
                        const groupedByBetTypeName: Record<string, AvailableBet[]> = oddsList.reduce((acc, odd) => {
                            const key = odd.bet_type?.name || 'Unknown Bet Type';
                            if (!acc[key]) acc[key] = [];
                            acc[key].push(odd);
                            return acc;
                        }, {} as Record<string, AvailableBet[]>);

                        return (
                            <Disclosure key={categoryName} as="div" className="bg-sleeper-secondary rounded-lg shadow" defaultOpen={['Game Lines', 'Team Totals'].includes(categoryName) || oddsList.length < 10}>
                                {({ open }) => (
                                    <>
                                        <Disclosure.Button className="flex justify-between w-full px-4 py-3 text-lg font-medium text-left text-sleeper-primary hover:bg-sleeper-tertiary focus:outline-none focus-visible:ring focus-visible:ring-sleeper-accent focus-visible:ring-opacity-75 rounded-t-lg">
                                            <span>{categoryName} <span className="text-xs text-gray-400">({oddsList.length} markets)</span></span>
                                            <ChevronUpIcon className={`${open ? 'transform rotate-180' : ''} w-6 h-6 text-sleeper-accent`} />
                                        </Disclosure.Button>
                                        <Disclosure.Panel className="px-2 sm:px-4 pt-3 pb-4 text-sm border-t border-sleeper-border">
                                            <div className="space-y-4">
                                                {Object.entries(groupedByBetTypeName).map(([betTypeName, specificOddsList]) => (
                                                    <div key={betTypeName} className="p-3 bg-sleeper-secondary-alt rounded-md shadow-sm">
                                                        <h4 className="text-md font-semibold text-sleeper-accent mb-3">{betTypeName}</h4>
                                                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                                                            {specificOddsList
                                                                .sort((a, b) => { // Custom sort: Over before Under, Yes before No, then by line/name
                                                                    if (a.selection_name.toLowerCase().includes('over') && b.selection_name.toLowerCase().includes('under')) return -1;
                                                                    if (a.selection_name.toLowerCase().includes('under') && b.selection_name.toLowerCase().includes('over')) return 1;
                                                                    if (a.selection_name.toLowerCase().includes('yes') && b.selection_name.toLowerCase().includes('no')) return -1;
                                                                    if (a.selection_name.toLowerCase().includes('no') && b.selection_name.toLowerCase().includes('yes')) return 1;
                                                                    if (a.line !== null && b.line !== null && a.line !== b.line) return (a.line || 0) - (b.line || 0);
                                                                    return a.selection_name.localeCompare(b.selection_name);
                                                                })
                                                                .map((odd) => (
                                                                    <button
                                                                        key={odd.id}
                                                                        onClick={() => handleOddSelect(odd)}
                                                                        disabled={isOddInBetSlip(odd.id) || !odd.is_active}
                                                                        className={`w-full p-3 text-left rounded focus:outline-none transition-colors duration-150 flex justify-between items-center group
                                                                        ${isOddInBetSlip(odd.id)
                                                                            ? 'bg-sleeper-accent-dark text-white cursor-not-allowed'
                                                                            : odd.is_active
                                                                                ? 'bg-sleeper-tertiary hover:bg-sleeper-accent text-sleeper-text-primary focus:ring-2 focus:ring-sleeper-accent-light'
                                                                                : 'bg-gray-700 text-gray-500 cursor-not-allowed opacity-60'
                                                                        }`}
                                                                    >
                                                                        <span className="block text-sm font-medium truncate group-hover:text-white">{odd.selection_name}</span>
                                                                        <span className={`block text-lg font-bold ${isOddInBetSlip(odd.id) ? 'text-white' : odd.is_active ? 'text-sleeper-accent-light group-hover:text-white' : 'text-gray-500'}`}>
                                                                        {odd.odds.toFixed(2)}
                                                                    </span>
                                                                    </button>
                                                                ))}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </Disclosure.Panel>
                                    </>
                                )}
                            </Disclosure>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

export default GameDetailPage;