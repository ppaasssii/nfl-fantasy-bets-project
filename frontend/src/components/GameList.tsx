// frontend/src/components/GameList.tsx
import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { useNavigate } from 'react-router-dom';
import { useDashboardOutletContext } from '../App';
import { americanToDecimal } from '../utils/oddsConverter';
import {
    CalendarDaysIcon,
    ArrowPathIcon,
    InboxIcon,
    ExclamationTriangleIcon,
    CheckCircleIcon,
    LockClosedIcon,
    PlayCircleIcon
} from '@heroicons/react/24/outline';
import { toast } from 'react-toastify';

// Typen
export interface QuickBetOption {
    id: number;
    odds: number;
    line?: number | null;
    selection_name: string;
    bet_type_api_key: string;
}
interface QuickBetMarket<T> {
    options?: T[];
    line?: number | null;
    home?: T;
    away?: T;
}
export interface StructuredQuickBets {
    moneyline?: QuickBetMarket<QuickBetOption>;
    spread?: QuickBetMarket<QuickBetOption>;
    total?: QuickBetMarket<QuickBetOption>;
}
export interface GameForListV2 {
    id: number;
    api_game_id: string;
    home_team: string;
    away_team: string;
    game_time: string;
    status: string;
    home_score?: number | null;
    away_score?: number | null;
    quick_bets: StructuredQuickBets | null;
}

const TEN_MINUTES_IN_MS = 10 * 60 * 1000;

const GameList: React.FC = () => {
    const navigate = useNavigate();
    const dashboardContext = useDashboardOutletContext();
    const addToBetSlip = dashboardContext?.addToBetSlip;
    const isOddInBetSlip = dashboardContext?.isOddInBetSlip;
    // const openBetSlipModal = dashboardContext?.openBetSlipModal; // Wird nicht mehr benötigt für autom. Öffnen

    const [allGames, setAllGames] = useState<GameForListV2[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [currentTime, setCurrentTime] = useState(new Date());

    useEffect(() => {
        const timer = setInterval(() => {
            setCurrentTime(new Date());
        }, 30000);
        return () => clearInterval(timer);
    }, []);

    const fetchGames = useCallback(async () => {
        setLoading(true); setError(null);
        try {
            const { data, error: rpcError } = await supabase.rpc('get_games_for_gamelist_v2');
            if (rpcError) throw rpcError;
            if (data) {
                setAllGames((data as any[]).map(game => ({ ...game, quick_bets: game.quick_bets || null })) as GameForListV2[]);
            } else { setAllGames([]); }
        } catch (e: any) {
            console.error("Error in fetchGames:", e);
            if (e.code === '42804' ) {
                setError(`DB Function 'get_games_for_gamelist_v2' type mismatch.`);
                toast.error(`DB Function type mismatch.`);
            } else if (e.code === 'PGRST202') {
                setError(`DB Function 'get_games_for_gamelist_v2' not found.`);
                toast.error(`Required DB Function not found.`);
            } else {
                setError("Failed to load games.");
                toast.error(`Could not fetch games: ${e.message}`);
            }
        } finally { setLoading(false); }
    }, []);

    useEffect(() => { fetchGames(); }, [fetchGames]);

    const formatGameTimeDisplay = (gameTime: string) => {
        const date = new Date(gameTime);
        return {
            weekday: date.toLocaleDateString('de-DE', { weekday: 'short' }),
            date: date.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' }),
            time: date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) + ' Uhr'
        };
    };

    const processedAndFilteredGames = allGames.filter(game => {
        const gameStartTimeMs = new Date(game.game_time).getTime();
        const currentTimeMs = currentTime.getTime();
        const isFinalBackend = game.status === 'finished' || game.status === 'FT' || game.status === 'Final';
        const isLiveBackend = game.status === 'live' || game.status === 'inprogress';
        const isPastGameTimeClient = currentTimeMs >= gameStartTimeMs;
        const isClientSideBlocked = isPastGameTimeClient && !isFinalBackend && !isLiveBackend;

        if (isClientSideBlocked && currentTimeMs > gameStartTimeMs + TEN_MINUTES_IN_MS) {
            return false;
        }
        return true;
    });

    const upcomingGames = processedAndFilteredGames
        .filter(game => !(game.status === 'finished' || game.status === 'FT' || game.status === 'Final'))
        .sort((a, b) => new Date(a.game_time).getTime() - new Date(b.game_time).getTime());

    const finalGames = processedAndFilteredGames
        .filter(game => game.status === 'finished' || game.status === 'FT' || game.status === 'Final')
        .sort((a, b) => new Date(b.game_time).getTime() - new Date(a.game_time).getTime());

    if (loading) {
        return (
            <div className="text-center py-10">
                <ArrowPathIcon className="animate-spin h-8 w-8 text-sleeper-primary mx-auto mb-3" />
                <p className="text-lg font-semibold text-sleeper-text-primary">Loading Upcoming Games...</p>
                <p className="text-sm text-sleeper-text-secondary">Fetching the latest matchups for you.</p>
            </div>
        );
    }
    if (error) {
        return (
            <div className="text-center py-10 bg-sleeper-surface p-6 rounded-lg shadow-md border border-sleeper-error/30">
                <ExclamationTriangleIcon className="h-10 w-10 text-sleeper-error mx-auto mb-3" />
                <p className="text-lg font-semibold text-sleeper-text-primary mb-1">Oops! Something went wrong.</p>
                <p className="text-sm text-sleeper-text-secondary mb-4">{error}</p>
                <button onClick={fetchGames} className="px-4 py-2 bg-sleeper-primary hover:bg-sleeper-primary-hover text-white text-sm font-semibold rounded-md transition-colors">
                    Try Again
                </button>
            </div>
        );
    }
    if (!loading && !error && allGames.length === 0) {
        return (
            <div className="text-center py-10 bg-sleeper-surface p-6 rounded-lg shadow-md border border-sleeper-border/50">
                <InboxIcon className="h-10 w-10 text-sleeper-text-secondary/70 mx-auto mb-3" />
                <p className="text-lg font-semibold text-sleeper-text-primary mb-1">No Games Available</p>
                <p className="text-sm text-sleeper-text-secondary">There are currently no games scheduled. Please check back later.</p>
            </div>
        );
    }

    const handleQuickBetClick = (option: QuickBetOption, game: GameForListV2, event: React.MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();

        const gameStartTime = new Date(game.game_time);
        const isFinalBackend = game.status === 'finished' || game.status === 'FT' || game.status === 'Final';
        const isLiveBackend = game.status === 'live' || game.status === 'inprogress';
        const isPastGameTimeClient = currentTime >= gameStartTime;
        const isClientSideBlocked = isPastGameTimeClient && !isFinalBackend && !isLiveBackend;

        if (isFinalBackend || isLiveBackend || isClientSideBlocked) {
            toast.info("Betting for this game is currently closed.");
            return;
        }

        if (!addToBetSlip || !isOddInBetSlip) { toast.warn("Bet slip system error."); return; }

        // const wasAlreadySelected = isOddInBetSlip(option.id); // Diese Zeile wird nicht mehr benötigt für Modal-Logik
        addToBetSlip(option, game);

        // Das automatische Öffnen des Modals wird hier entfernt:
        // if (!wasAlreadySelected && openBetSlipModal) {
        //     openBetSlipModal();
        // }
    };

    const renderQuickBetButtonForTable = (option: QuickBetOption | undefined, game: GameForListV2, marketType: 'h2h' | 'spreads' | 'totals', teamContext?: 'home' | 'away' | 'over' | 'under', placeholder: string = '-') => {
        if (!option || !isOddInBetSlip) { // isOddInBetSlip hier evtl. nicht nötig, wenn Button immer aktiv sein soll bis zum Klick
            return <div className="text-sleeper-text-secondary text-center py-2 h-[40px] sm:h-[44px] flex items-center justify-center text-xs">{placeholder}</div>;
        }
        const decimalOddForDisplay = americanToDecimal(option.odds);
        const isSelected = isOddInBetSlip(option.id); // Bleibt für das Styling des Buttons

        let linePrefix = "";
        if (marketType === 'spreads' && option.line != null) {
            linePrefix = `${option.line > 0 ? '+':''}${option.line.toFixed(1)}`;
        } else if (marketType === 'totals' && game.quick_bets?.total?.line != null) {
            const line = game.quick_bets.total.line.toFixed(1);
            if (teamContext === 'over') linePrefix = `O ${line}`;
            if (teamContext === 'under') linePrefix = `U ${line}`;
        }

        return (
            <button
                key={option.id}
                className={`w-full min-h-[40px] sm:min-h-[44px] flex flex-col items-center justify-center px-0.5 py-1 rounded border text-xs font-semibold transition-colors duration-150 focus:outline-none focus-visible:ring-1 focus-visible:ring-offset-1 focus-visible:ring-offset-sleeper-surface
                    ${isSelected
                    ? 'bg-sleeper-primary text-white border-sleeper-primary ring-1 ring-sleeper-accent shadow-md'
                    : 'bg-sleeper-surface-200 text-sleeper-text-primary border-sleeper-border hover:border-sleeper-primary/70 hover:bg-sleeper-primary/10'
                }`}
                onClick={(e) => handleQuickBetClick(option, game, e)}
                title={`${isSelected ? 'Remove from slip' : 'Add to slip'}: ${option.selection_name}`}
            >
                {linePrefix && <span className="text-xxs text-sleeper-text-secondary -mb-0.5 block truncate">{linePrefix}</span>}
                <span className="block text-sm">{decimalOddForDisplay.toFixed(2)}</span>
            </button>
        );
    };

    const renderGameCard = (game: GameForListV2) => {
        const { weekday, date, time } = formatGameTimeDisplay(game.game_time);
        const gameStartTime = new Date(game.game_time);

        const isFinalBackend = game.status === 'finished' || game.status === 'FT' || game.status === 'Final';
        const isLiveBackend = game.status === 'live' || game.status === 'inprogress';
        const isPastGameTimeClient = currentTime >= gameStartTime;
        const isClientSideBlocked = isPastGameTimeClient && !isFinalBackend && !isLiveBackend;

        const isOpen = !isFinalBackend && !isLiveBackend && !isClientSideBlocked &&
            (game.status === 'scheduled' || game.status === 'NS' || game.status === 'upcoming');

        const showBettingArea = isOpen && game.quick_bets && Object.keys(game.quick_bets).length > 0;
        const showSuspendedMessage = !isFinalBackend && (isLiveBackend || isClientSideBlocked);

        let statusLabelText = "";
        let statusLabelClasses = "";
        let StatusIcon = null;
        let displayTeamNamesInHeader = true;

        if (isFinalBackend) {
            statusLabelText = game.status.toUpperCase();
            statusLabelClasses = "bg-gray-700 text-gray-300";
        } else if (isLiveBackend) {
            statusLabelText = "LIVE";
            statusLabelClasses = "bg-red-500 text-white animate-pulse";
            StatusIcon = PlayCircleIcon;
        } else if (isClientSideBlocked) {
            statusLabelText = "BLOCKED";
            statusLabelClasses = "bg-orange-600 text-white";
            StatusIcon = LockClosedIcon;
        } else if (isOpen) {
            statusLabelText = "OPEN";
            statusLabelClasses = "bg-green-500 text-white";
            StatusIcon = CheckCircleIcon;
            displayTeamNamesInHeader = false;
        } else if (game.status) {
            statusLabelText = game.status.toUpperCase();
            statusLabelClasses = "bg-yellow-600/40 text-yellow-200";
        }

        const qb = game.quick_bets;
        const getMoneylineOption = (teamType: 'home' | 'away') => qb?.moneyline?.[teamType];
        const homeSpreadOption = qb?.spread?.options?.find(opt => opt.selection_name.includes(game.home_team) || (opt.line != null && opt.line < 0));
        const awaySpreadOption = qb?.spread?.options?.find(opt => opt.selection_name.includes(game.away_team) || (opt.line != null && opt.line > 0));
        const totalOverOption = qb?.total?.options?.find(opt => opt.selection_name.toLowerCase().includes('over'));
        const totalUnderOption = qb?.total?.options?.find(opt => opt.selection_name.toLowerCase().includes('under'));

        const navigateToGameDetail = () => {
            // Navigation nur verhindern, wenn Spiel aktiv gesperrt (LIVE oder BLOCKED) ist.
            // Finale Spiele sollten weiterhin zur Detailansicht führen können (um Ergebnisse/Stats zu sehen).
            if (isLiveBackend || isClientSideBlocked) {
                toast.info("Game is live or betting is suspended. Details are not available for betting.");
                return;
            }
            navigate(`/game/${game.id}`);
        };

        return (
            <div key={game.id} className={`bg-sleeper-surface rounded-lg shadow-md border border-sleeper-border/60 transition-all duration-150 ease-in-out relative ${isFinalBackend || showSuspendedMessage ? 'opacity-80' : 'hover:border-sleeper-primary/80'}`}>
                <div onClick={navigateToGameDetail} className={`${isLiveBackend || isClientSideBlocked ? '' : 'cursor-pointer'}`}>
                    <div className="px-3 pt-2.5 pb-1.5 sm:px-4 sm:pt-3 sm:pb-2 border-b border-sleeper-border/30">
                        <div className="flex justify-between items-center mb-1">
                            <div className="flex items-center space-x-1.5 sm:space-x-2">
                                <CalendarDaysIcon className="h-5 w-5 text-sleeper-text-secondary/80 flex-shrink-0" />
                                <span className="text-xs sm:text-sm font-bold text-sleeper-text-primary">{weekday}, {date}</span>
                                <span className="text-xs sm:text-sm text-sleeper-text-secondary font-medium">- {time}</span>
                            </div>
                            {statusLabelText && (
                                <span className={`flex items-center text-xxs font-bold px-1.5 py-px sm:px-2 sm:py-0.5 rounded-full shadow-sm ${statusLabelClasses}`}>
                                    {StatusIcon && <StatusIcon className="h-2.5 w-2.5 sm:h-3 sm:w-3 mr-0.5 sm:mr-1" />}
                                    {statusLabelText}
                                </span>
                            )}
                        </div>
                        {displayTeamNamesInHeader && (
                            <div className="mt-1">
                                <h3 className="text-sm sm:text-base font-semibold text-sleeper-text-primary leading-tight hover:text-sleeper-primary transition-colors" title={`${game.away_team} @ ${game.home_team}`}>
                                    {game.away_team} <span className="text-sleeper-text-secondary/80 mx-1">@</span> {game.home_team}
                                </h3>
                            </div>
                        )}
                    </div>
                </div>

                <div className="relative">
                    {isFinalBackend && game.home_score != null && game.away_score != null ? (
                        <div onClick={navigateToGameDetail} className={`block px-3 py-3 sm:px-4 sm:py-4 text-center hover:bg-sleeper-surface-200/30 transition-colors ${isLiveBackend || isClientSideBlocked ? '' : 'cursor-pointer'}`}>
                            <p className="text-base sm:text-lg font-bold text-sleeper-text-primary">{game.away_team} {game.away_score} @ {game.home_team} {game.home_score}</p>
                        </div>
                    ) : showBettingArea && qb ? (
                        <div className="px-1 py-2 sm:px-1.5 sm:py-3 text-xs">
                            <div
                                className="grid grid-cols-[minmax(0,_1fr)_repeat(3,_minmax(45px,_75px))] sm:grid-cols-[minmax(0,_1fr)_repeat(3,_minmax(55px,_85px))] gap-x-1 mb-1 text-center text-xxs font-bold text-sleeper-text-secondary uppercase tracking-wider"
                            >
                                <div onClick={navigateToGameDetail} className={`text-left pl-1 ${isLiveBackend || isClientSideBlocked ? '' : 'cursor-pointer hover:text-sleeper-text-primary'} ${displayTeamNamesInHeader ? 'invisible h-0' : ''}`}>Team</div>
                                <div className="py-0.5">Winner</div>
                                <div className="py-0.5">Spread</div>
                                <div className="py-0.5">Total</div>
                            </div>
                            <div onClick={navigateToGameDetail} className={`grid grid-cols-[minmax(0,_1fr)_repeat(3,_minmax(45px,_75px))] sm:grid-cols-[minmax(0,_1fr)_repeat(3,_minmax(55px,_85px))] gap-x-1 items-stretch min-h-[44px] hover:bg-sleeper-surface-200/20 rounded px-0.5 py-0.5 group ${isLiveBackend || isClientSideBlocked ? '' : 'cursor-pointer'}`}>
                                <div className={`font-semibold text-xs text-sleeper-text-primary group-hover:text-sleeper-primary transition-colors pr-0.5 text-left leading-tight flex items-center ${displayTeamNamesInHeader ? 'invisible' : ''}`}>
                                    {game.home_team}
                                </div>
                                <div>{renderQuickBetButtonForTable(getMoneylineOption('home'), game, 'h2h', 'home')}</div>
                                <div>{renderQuickBetButtonForTable(homeSpreadOption, game, 'spreads', 'home')}</div>
                                <div>{renderQuickBetButtonForTable(totalOverOption, game, 'totals', 'over')}</div>
                            </div>
                            <div onClick={navigateToGameDetail} className={`grid grid-cols-[minmax(0,_1fr)_repeat(3,_minmax(45px,_75px))] sm:grid-cols-[minmax(0,_1fr)_repeat(3,_minmax(55px,_85px))] gap-x-1 items-stretch min-h-[44px] hover:bg-sleeper-surface-200/20 rounded px-0.5 py-0.5 group ${isLiveBackend || isClientSideBlocked ? '' : 'cursor-pointer'}`}>
                                <div className={`font-semibold text-xs text-sleeper-text-primary group-hover:text-sleeper-primary transition-colors pr-0.5 text-left leading-tight flex items-center ${displayTeamNamesInHeader ? 'invisible' : ''}`}>
                                    {game.away_team}
                                </div>
                                <div>{renderQuickBetButtonForTable(getMoneylineOption('away'), game, 'h2h', 'away')}</div>
                                <div>{renderQuickBetButtonForTable(awaySpreadOption, game, 'spreads', 'away')}</div>
                                <div>{renderQuickBetButtonForTable(totalUnderOption, game, 'totals', 'under')}</div>
                            </div>
                        </div>
                    ) : showSuspendedMessage ? (
                            <div onClick={navigateToGameDetail} className={`block px-3 py-3 sm:px-4 sm:py-4 mt-1 hover:bg-sleeper-surface-200/30 transition-colors ${isLiveBackend || isClientSideBlocked ? '' : 'cursor-pointer'}`}>
                                <p className="text-xs text-center text-sleeper-text-secondary py-1 italic flex items-center justify-center">
                                    <LockClosedIcon className="h-3.5 w-3.5 mr-1.5"/> Betting Suspended.
                                </p>
                            </div>
                        )
                        : isOpen && !qb ? (
                            <div onClick={navigateToGameDetail} className="block px-3 py-3 sm:px-4 sm:py-4 mt-2 hover:bg-sleeper-surface-200/30 transition-colors cursor-pointer">
                                <p className="text-xs text-center text-sleeper-text-secondary py-1 italic">No quick bets. Click to view markets.</p>
                            </div>
                        ) : (
                            <div onClick={navigateToGameDetail} className="block px-3 py-4 sm:px-4 sm:py-5 text-center hover:bg-sleeper-surface-200/30 transition-colors cursor-pointer">
                                <p className="text-sm text-sleeper-text-secondary">View Game Details</p>
                            </div>
                        )}
                </div>
            </div>
        );
    };

    return (
        <div className="space-y-6">
            {upcomingGames.length > 0 && (
                <div>
                    <h2 className="text-xl font-semibold text-sleeper-text-primary mb-2 sm:mb-3 px-1">Upcoming</h2>
                    <div className="space-y-3 sm:space-y-4">
                        {upcomingGames.map((game) => renderGameCard(game))}
                    </div>
                </div>
            )}
            {!loading && !error && upcomingGames.length === 0 && allGames.length > 0 && (
                <div className="text-center py-6">
                    <InboxIcon className="mx-auto h-10 w-10 text-sleeper-text-secondary/70 mb-2" />
                    <p className="font-semibold text-sleeper-text-primary">No upcoming games at the moment.</p>
                    <p className="text-sm text-sleeper-text-secondary">Check back later or view results below.</p>
                </div>
            )}
            {finalGames.length > 0 && (
                <div>
                    <h2 className="text-xl font-semibold text-sleeper-text-primary mb-2 sm:mb-3 mt-6 sm:mt-8 px-1">Results</h2>
                    <div className="space-y-3 sm:space-y-4">
                        {finalGames.map((game) => renderGameCard(game))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default GameList;