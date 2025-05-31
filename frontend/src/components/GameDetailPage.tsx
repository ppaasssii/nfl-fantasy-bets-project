// frontend/src/components/GameDetailPage.tsx
import React, { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { toast } from 'react-toastify';
import { Tab, Disclosure } from '@headlessui/react'; // Disclosure wird verwendet
import {
    ChevronUpIcon, // Wird in Disclosure.Button verwendet
    ArrowLeftIcon,
    NoSymbolIcon,          // Wird im Leerzustand für Wetten verwendet
    ArrowPathIcon,         // Wird im Ladezustand verwendet
    CalendarDaysIcon,      // Wird im Game Header verwendet
    ExclamationTriangleIcon, // Wird im Fehlerzustand verwendet
    //InformationCircleIcon  // Wird optional im Game Header oder für finale Spiele verwendet
} from '@heroicons/react/24/outline';

import { useDashboardOutletContext } from '../App';
import { americanToDecimal } from '../utils/oddsConverter'; // Wird in renderOddButton verwendet
import type { GameForListV2 } from './GameList'; // Für den gameContext in addToBetSlip

// Typen
interface Game {
    id: number;
    api_game_id: string;
    home_team: string;
    away_team: string;
    game_time: string;
    status: string;
    home_score?: number | null;
    away_score?: number | null;
}

interface BetTypeInterface {
    id: number;
    name: string;
    api_market_key: string;
    description?: string;
}

// AvailableBetDetail wird von dieser Komponente verwendet und an addToBetSlip übergeben
export interface AvailableBetDetail { // Exportieren, damit DashboardLayout es importieren kann
    id: number;
    game_id: number;
    bet_type_id: number;
    selection_name: string;
    odds: number;
    line?: number | null;
    is_active: boolean;
    is_winning_outcome?: boolean | null;
    source_bookmaker?: string | null;
    last_api_update?: string | null;
    bet_type_name: string;      // Wird beim Laden hinzugefügt
    home_team: string;          // Wird beim Laden hinzugefügt
    away_team: string;          // Wird beim Laden hinzugefügt
    bet_type_api_key: string;   // Sicherstellen, dass dies non-optional ist und immer gesetzt wird
}

interface GroupedBetOption {
    groupName: string;
    options: AvailableBetDetail[];
}

interface BetCategory {
    categoryName: string;
    groupedOptions: GroupedBetOption[];
}

const GameDetailPage: React.FC = () => {
    const { dbGameId } = useParams<{ dbGameId: string }>();
    const dashboardContext = useDashboardOutletContext();
    const addToBetSlip = dashboardContext?.addToBetSlip;
    const isOddInBetSlip = dashboardContext?.isOddInBetSlip;
    const openBetSlipModal = dashboardContext?.openBetSlipModal;

    const [game, setGame] = useState<Game | null>(null);
    const [betCategories, setBetCategories] = useState<BetCategory[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchGameDetails = useCallback(async () => {
        if (!dbGameId) { setError("Game ID is missing."); setLoading(false); return; }
        setLoading(true); setError(null);
        try {
            const { data: gameData, error: gameError } = await supabase
                .from('games')
                .select('*')
                .eq('id', parseInt(dbGameId, 10))
                .single();
            if (gameError) throw gameError;
            if (!gameData) throw new Error("Game not found.");
            setGame(gameData as Game);

            const { data: availableBetsData, error: betsError } = await supabase
                .from('available_bets')
                .select(`*, bet_types (id, name, api_market_key, description)`)
                .eq('game_id', parseInt(dbGameId, 10))
                .eq('is_active', true)
                .order('selection_name', { ascending: true });
            if (betsError) throw betsError;

            const categoriesMap = new Map<string, BetCategory>();
            availableBetsData?.forEach(bet => {
                if (!bet.bet_types) return;
                const betType = bet.bet_types as BetTypeInterface;
                const categoryName = betType.name;
                const enrichedBet: AvailableBetDetail = {
                    ...bet,
                    bet_type_name: categoryName,
                    home_team: gameData.home_team,
                    away_team: gameData.away_team,
                    bet_type_api_key: betType.api_market_key // Wird hier gesetzt
                };

                if (!categoriesMap.has(categoryName)) {
                    categoriesMap.set(categoryName, { categoryName: categoryName, groupedOptions: [] });
                }
                const currentCategory = categoriesMap.get(categoryName)!;
                let groupIdentifier = "All Options"; // Default
                const selectionLower = bet.selection_name.toLowerCase();
                const commonPlayerPropKeywords = ['over', 'under', 'yes', 'no', 'at least', 'first to score', 'to record', 'rush yds', 'pass yds', 'rec yds', 'tds'];
                let potentialPlayerName = bet.selection_name;

                if (categoryName.toLowerCase().includes('player')) {
                    for (const keyword of commonPlayerPropKeywords) {
                        const index = selectionLower.indexOf(` ${keyword.toLowerCase()}`);
                        if (index > -1) {
                            potentialPlayerName = bet.selection_name.substring(0, index).trim();
                            break;
                        }
                    }
                    if (potentialPlayerName.length < 3 || potentialPlayerName.length > 30 || commonPlayerPropKeywords.some(kw => potentialPlayerName.toLowerCase().includes(kw))) {
                        potentialPlayerName = "Player Specials";
                    }
                    groupIdentifier = potentialPlayerName;
                } else if (categoryName.toLowerCase().includes('game') || categoryName.toLowerCase().includes('match') || categoryName.toLowerCase().includes('moneyline') || categoryName.toLowerCase().includes('spread') || categoryName.toLowerCase().includes('total')) {
                    groupIdentifier = categoryName;
                } else {
                    groupIdentifier = categoryName;
                }

                let group = currentCategory.groupedOptions.find(g => g.groupName === groupIdentifier);
                if (!group) {
                    group = { groupName: groupIdentifier, options: [] };
                    currentCategory.groupedOptions.push(group);
                }
                group.options.push(enrichedBet);
            });
            categoriesMap.forEach(category => {
                category.groupedOptions.sort((a, b) => a.groupName.localeCompare(b.groupName));
                category.groupedOptions.forEach(group => {
                    group.options.sort((a, b) => {
                        if (a.selection_name.toLowerCase().includes('over') || a.selection_name.toLowerCase().includes('yes')) return -1;
                        if (b.selection_name.toLowerCase().includes('over') || b.selection_name.toLowerCase().includes('yes')) return 1;
                        if (gameData && a.selection_name === gameData.home_team) return -1;
                        if (gameData && b.selection_name === gameData.home_team) return 1;
                        return (a.line ?? 0) - (b.line ?? 0) || a.selection_name.localeCompare(b.selection_name);
                    });
                });
            });
            setBetCategories(Array.from(categoriesMap.values()).sort((a,b) => a.categoryName.localeCompare(b.categoryName)));
        } catch (e: any) {
            console.error("Error fetching game details:", e);
            setError(e.message || "Failed to load game details.");
            toast.error(e.message || "Could not fetch game details.");
        } finally { setLoading(false); }
    }, [dbGameId]);

    useEffect(() => { fetchGameDetails(); }, [fetchGameDetails]);

    const handleBetSelection = (odd: AvailableBetDetail) => { // Wird in renderOddButton verwendet
        if (!addToBetSlip || !isOddInBetSlip || !game) {
            toast.warn("Cannot process bet selection at this time.");
            return;
        }
        const gameContextForSlip: GameForListV2 = {
            id: game.id,
            api_game_id: game.api_game_id,
            home_team: game.home_team,
            away_team: game.away_team,
            game_time: game.game_time,
            status: game.status,
            home_score: game.home_score,
            away_score: game.away_score,
            quick_bets: null,
        };
        addToBetSlip(odd, gameContextForSlip);
        if (openBetSlipModal) {
            setTimeout(() => {
                if (isOddInBetSlip(odd.id)) {
                    openBetSlipModal();
                }
            }, 100);
        }
    };

    // formatGameTime wird im JSX verwendet
    const formatGameTime = (gameTimeStr: string | undefined): string => {
        if (!gameTimeStr) return "N/A";
        const date = new Date(gameTimeStr);
        return `${date.toLocaleDateString('de-DE', { weekday: 'long', month: 'long', day: 'numeric' })} - ${date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr`;
    };

    // renderOddButton wird im JSX verwendet
    const renderOddButton = (odd: AvailableBetDetail, displayName: string) => {
        const isSelected = isOddInBetSlip ? isOddInBetSlip(odd.id) : false;
        const decimalOddForDisplay = americanToDecimal(odd.odds);

        return (
            <button
                key={odd.id}
                onClick={() => handleBetSelection(odd)}
                className={`w-full flex flex-col items-center justify-center p-2 sm:p-2.5 rounded-md border text-center transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-sleeper-primary focus-visible:ring-offset-2 focus-visible:ring-offset-sleeper-surface
                    ${isSelected
                    ? 'bg-sleeper-primary text-white border-sleeper-primary shadow-md'
                    : 'bg-sleeper-surface-200 text-sleeper-text-primary border-sleeper-border hover:border-sleeper-primary/70 hover:bg-sleeper-primary/10'
                }`}
                title={isSelected ? `Remove "${displayName}" from slip` : `Add "${displayName}" to slip`}
            >
                <span className="block text-xs sm:text-sm font-medium truncate w-full">{displayName}</span>
                {odd.line !== null && odd.line !== undefined && (
                    <span className="block text-xxs sm:text-xs text-sleeper-text-secondary/80">
                        {odd.line > 0 ? `+${odd.line.toFixed(1)}` : odd.line.toFixed(1)}
                    </span>
                )}
                <span className="block text-sm sm:text-base font-bold mt-0.5">{decimalOddForDisplay.toFixed(2)}</span>
            </button>
        );
    };

    if (loading) return (
        <div className="text-center py-10">
            <ArrowPathIcon className="animate-spin h-8 w-8 text-sleeper-primary mx-auto mb-3" />
            <p className="text-lg font-semibold text-sleeper-text-primary">Loading Game Details...</p>
        </div>
    );
    if (error) return (
        <div className="text-center py-10 bg-sleeper-surface p-6 rounded-lg shadow-md border border-sleeper-error/30">
            <ExclamationTriangleIcon className="h-10 w-10 text-sleeper-error mx-auto mb-3" />
            <p className="text-lg font-semibold text-sleeper-text-primary mb-1">Error Loading Game</p>
            <p className="text-sm text-sleeper-text-secondary mb-4">{error}</p>
            <Link to="/" className="px-4 py-2 bg-sleeper-primary hover:bg-sleeper-primary-hover text-white text-sm font-semibold rounded-md transition-colors">
                Back to Games
            </Link>
        </div>
    );
    if (!game && !loading && !error) return (
        <div className="text-center py-10">
            <NoSymbolIcon className="h-10 w-10 text-sleeper-text-secondary mx-auto mb-3" />
            <p className="text-xl font-semibold text-sleeper-text-primary">Game not found.</p>
        </div>
    );
    if (!game) return null;

    const gameStatusDisplay = game.status !== 'scheduled' && game.status !== 'NS' ? game.status.toUpperCase() : null;

    return (
        <div className="pb-8">
            <Link to="/" className="inline-flex items-center text-sm text-sleeper-text-secondary hover:text-sleeper-primary mb-4 group">
                <ArrowLeftIcon className="h-5 w-5 mr-2 transition-transform duration-150 ease-in-out group-hover:-translate-x-1" />
                Back to All Games
            </Link>

            <div className="bg-sleeper-surface p-3 sm:p-5 rounded-lg shadow-md mb-5 sm:mb-6 border border-sleeper-border/60">
                <div className="flex flex-col sm:flex-row justify-between items-center">
                    <div className="text-center sm:text-left mb-3 sm:mb-0">
                        <h1 className="text-xl sm:text-2xl font-bold text-sleeper-text-primary truncate flex items-center" title={`${game.away_team} @ ${game.home_team}`}>
                            {/* <InformationCircleIcon className="h-5 w-5 mr-2 text-sleeper-text-secondary/70" /> */} {/* InformationCircleIcon optional hier */}
                            {game.away_team} <span className="text-sleeper-text-secondary/70 mx-1 sm:mx-2">@</span> {game.home_team}
                        </h1>
                        <p className="text-xs sm:text-sm text-sleeper-text-secondary mt-1 flex items-center justify-center sm:justify-start">
                            <CalendarDaysIcon className="h-4 w-4 mr-1.5 text-sleeper-text-secondary/70 flex-shrink-0" />
                            {formatGameTime(game.game_time)}
                            {gameStatusDisplay && (
                                <span className={`ml-2 px-2 py-0.5 text-xs font-semibold rounded-full
                                    ${game.status === 'live' || game.status === 'inprogress' ? 'bg-red-500/20 text-red-400 animate-pulse' :
                                    game.status === 'finished' || game.status === 'FT' ? 'bg-green-500/15 text-green-400' : 'bg-yellow-500/15 text-yellow-400'}`}>
                                    {gameStatusDisplay}
                                </span>
                            )}
                        </p>
                    </div>
                    {(game.home_score != null && game.away_score != null && game.status !== 'scheduled' && game.status !== 'NS') && (
                        <div className="text-xl sm:text-2xl font-bold text-sleeper-text-primary whitespace-nowrap">
                            {game.away_score} - {game.home_score}
                        </div>
                    )}
                </div>
            </div>

            {betCategories.length === 0 && !loading && (
                <div className="text-center py-8 bg-sleeper-surface p-6 rounded-lg shadow-md border border-sleeper-border/50">
                    <NoSymbolIcon className="h-10 w-10 text-sleeper-text-secondary/70 mx-auto mb-3" />
                    <p className="text-lg font-semibold text-sleeper-text-primary mb-1">No Bets Available</p>
                    <p className="text-sm text-sleeper-text-secondary">
                        There are currently no betting markets open for this game. Please check back later.
                    </p>
                </div>
            )}

            {betCategories.length > 0 && (
                <Tab.Group>
                    <Tab.List className="flex space-x-1 sm:space-x-2 rounded-xl bg-sleeper-surface-200 p-1 border border-sleeper-border mb-4 sm:mb-5 overflow-x-auto custom-scrollbar">
                        {betCategories.map((category) => (
                            <Tab
                                key={category.categoryName}
                                className={({ selected }) =>
                                    `w-full sm:w-auto whitespace-nowrap rounded-lg 
                                    focus:outline-none focus-visible:ring-2 ring-offset-2 ring-offset-sleeper-surface-200 ring-white ring-opacity-60
                                    ${selected
                                        ? 'bg-sleeper-primary text-white shadow font-semibold text-xs sm:text-sm px-2.5 py-1.5 sm:px-3 sm:py-2'
                                        : 'text-sleeper-text-secondary hover:bg-sleeper-surface-300/70 hover:text-sleeper-text-primary text-xs sm:text-sm px-2.5 py-1.5 sm:px-3 sm:py-2'
                                    }`
                                }
                            >
                                {category.categoryName}
                            </Tab>
                        ))}
                    </Tab.List>
                    <Tab.Panels>
                        {betCategories.map((category) => (
                            <Tab.Panel key={category.categoryName} className="space-y-3 sm:space-y-4">
                                {category.groupedOptions.map((group) => (
                                    <Disclosure key={group.groupName} defaultOpen={category.groupedOptions.length === 1 || group.groupName.toLowerCase().includes('game') || category.groupedOptions.length < 3}>
                                        {({ open }) => (
                                            <div className="bg-sleeper-surface p-0.5 sm:p-1 rounded-lg border border-sleeper-border/60 shadow-sm">
                                                <Disclosure.Button
                                                    className="flex justify-between w-full px-3 py-2 sm:px-4 sm:py-2.5 text-left text-sm sm:text-base font-medium text-sleeper-text-primary bg-sleeper-surface hover:bg-sleeper-surface-200/70 rounded-md focus:outline-none focus-visible:ring focus-visible:ring-sleeper-primary focus-visible:ring-opacity-75"
                                                >
                                                    <span>{group.groupName}</span>
                                                    <ChevronUpIcon
                                                        className={`${open ? 'transform rotate-180' : ''} w-5 h-5 text-sleeper-primary transition-transform`}
                                                    />
                                                </Disclosure.Button>
                                                <Disclosure.Panel className="px-2 pt-2 pb-3 sm:px-3 sm:pt-3 sm:pb-4 text-sm">
                                                    <div
                                                        className={`grid ${
                                                            group.options.length === 1 ? 'grid-cols-1' :
                                                                (group.options.length === 3 && !group.groupName.toLowerCase().includes('player') && !group.groupName.toLowerCase().includes('total') ? 'grid-cols-3' : 'grid-cols-2')
                                                        } gap-2 sm:gap-3`}
                                                    >
                                                        {group.options.map(odd => renderOddButton(odd, odd.selection_name))}
                                                    </div>
                                                </Disclosure.Panel>
                                            </div>
                                        )}
                                    </Disclosure>
                                ))}
                                {category.groupedOptions.length === 0 && (
                                    <p className="text-center text-sleeper-text-secondary py-4">No specific options found for {category.categoryName}.</p>
                                )}
                            </Tab.Panel>
                        ))}
                    </Tab.Panels>
                </Tab.Group>
            )}
        </div>
    );
};
export default GameDetailPage;