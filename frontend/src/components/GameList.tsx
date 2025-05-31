// frontend/src/components/GameList.tsx
import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { useNavigate } from 'react-router-dom'; // useNavigate wird verwendet
import { useDashboardOutletContext } from '../App';
import { americanToDecimal } from '../utils/oddsConverter';
import {
    CalendarDaysIcon,
    // SquaresPlusIcon, // Entfernt, da Button nicht mehr gewünscht
    ArrowPathIcon,
    InboxIcon,
    ExclamationTriangleIcon,
    CheckCircleIcon,
    // InformationCircleIcon // Entfernt, da Button nicht mehr gewünscht
} from '@heroicons/react/24/outline';
import { toast } from 'react-toastify';

// Typen (QuickBetOption, StructuredQuickBets, GameForListV2 bleiben gleich wie in der letzten Version)
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


const GameList: React.FC = () => {
    const navigate = useNavigate();
    const dashboardContext = useDashboardOutletContext();
    const addToBetSlip = dashboardContext?.addToBetSlip;
    const isOddInBetSlip = dashboardContext?.isOddInBetSlip;
    const openBetSlipModal = dashboardContext?.openBetSlipModal;

    const [allGames, setAllGames] = useState<GameForListV2[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

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
                setError(`DB Function 'get_games_for_gamelist_v2' type mismatch. Scores should be integer.`);
                toast.error(`DB Function type mismatch for scores.`);
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
            date: date.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' }),
            time: date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) + ' Uhr'
        };
    };

    const upcomingGames = allGames
        .filter(game => !(game.status === 'finished' || game.status === 'FT' || game.status === 'Final'))
        .sort((a, b) => new Date(a.game_time).getTime() - new Date(b.game_time).getTime());

    const finalGames = allGames
        .filter(game => game.status === 'finished' || game.status === 'FT' || game.status === 'Final')
        .sort((a, b) => new Date(b.game_time).getTime() - new Date(a.game_time).getTime());

    // Lade-, Fehler-, Leerzustände verwenden jetzt die importierten Icons
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

        if (!addToBetSlip || !isOddInBetSlip) {
            toast.warn("Bet slip system error.");
            return;
        }
        addToBetSlip(option, game);
        if (openBetSlipModal) {
            setTimeout(() => {
                if (isOddInBetSlip(option.id)) {
                    openBetSlipModal();
                }
            }, 100);
        }
    };

    const renderQuickBetButtonForTable = (option: QuickBetOption | undefined, game: GameForListV2, marketType: 'h2h' | 'spreads' | 'totals', teamContext?: 'home' | 'away' | 'over' | 'under', placeholder: string = '-') => {
        if (!option || !isOddInBetSlip) {
            return <div className="text-sleeper-text-secondary text-center py-2 h-[44px] flex items-center justify-center">{placeholder}</div>;
        }
        const decimalOddForDisplay = americanToDecimal(option.odds);
        const isSelected = isOddInBetSlip(option.id);

        let linePrefix = "";
        if (marketType === 'spreads' && option.line != null) {
            linePrefix = `${option.line > 0 ? '+':''}${option.line.toFixed(1)}`;
        } else if (marketType === 'totals' && game.quick_bets?.total?.line != null) {
            // Für "Total"-Buttons wird die Linie jetzt direkt mit O/U angezeigt
            const line = game.quick_bets.total.line.toFixed(1);
            if (teamContext === 'over') linePrefix = `O ${line}`;
            if (teamContext === 'under') linePrefix = `U ${line}`;
        }

        return (
            <button
                key={option.id}
                className={`w-full min-h-[44px] flex flex-col items-center justify-center px-1 py-1.5 rounded border text-xs font-semibold transition-colors duration-150 focus:outline-none focus-visible:ring-1 focus-visible:ring-offset-1 focus-visible:ring-offset-sleeper-surface
                    ${isSelected
                    ? 'bg-sleeper-primary text-white border-sleeper-primary ring-1 ring-sleeper-accent shadow-md'
                    : 'bg-sleeper-surface-200 text-sleeper-text-primary border-sleeper-border hover:border-sleeper-primary/70 hover:bg-sleeper-primary/10'
                }`}
                onClick={(e) => handleQuickBetClick(option, game, e)}
                title={`${isSelected ? 'Remove from slip' : 'Add to slip'}: ${option.selection_name}`}
            >
                {linePrefix && <span className="text-xxs text-sleeper-text-secondary -mb-0.5">{linePrefix}</span>}
                <span>{decimalOddForDisplay.toFixed(2)}</span>
            </button>
        );
    };

    const renderGameCard = (game: GameForListV2, isFinal: boolean) => {
        const { date, time } = formatGameTimeDisplay(game.game_time);
        const gameStatusDisplay = game.status !== 'scheduled' && game.status !== 'NS' ? game.status.toUpperCase() : null;
        const isOpenForBetting = !isFinal && (game.status === 'scheduled' || game.status === 'NS' || game.status === 'live' || game.status === 'inprogress');
        const qb = game.quick_bets;

        const getMoneylineOption = (teamType: 'home' | 'away') => qb?.moneyline?.[teamType];
        const homeSpreadOption = qb?.spread?.options?.find(opt => opt.selection_name.includes(game.home_team) || (opt.line != null && opt.line < 0));
        const awaySpreadOption = qb?.spread?.options?.find(opt => opt.selection_name.includes(game.away_team) || (opt.line != null && opt.line > 0));
        const totalOverOption = qb?.total?.options?.find(opt => opt.selection_name.toLowerCase().includes('over'));
        const totalUnderOption = qb?.total?.options?.find(opt => opt.selection_name.toLowerCase().includes('under'));

        const navigateToGameDetail = () => {
            navigate(`/game/${game.id}`);
        };

        return (
            <div key={game.id} className={`bg-sleeper-surface rounded-lg shadow-md border border-sleeper-border/60 transition-all duration-150 ease-in-out relative ${isFinal ? 'opacity-75 hover:opacity-90' : 'hover:border-sleeper-primary/80'}`}>
                {/* Klickbarer Bereich für Navigation (ohne Buttons) */}
                <div onClick={navigateToGameDetail} className="cursor-pointer">
                    <div className="px-3 pt-2.5 pb-1.5 sm:px-4 sm:pt-3 sm:pb-2 border-b border-sleeper-border/30">
                        <div className="flex justify-between items-center">
                            <div className="flex items-center space-x-2">
                                <CalendarDaysIcon className="h-5 w-5 text-sleeper-text-secondary/80" /> {/* Prominenteres Icon und Text */}
                                <span className="text-sm font-bold text-sleeper-text-primary">{date}</span>
                                <span className="text-sm text-sleeper-text-secondary font-medium">- {time}</span>
                            </div>
                            {isOpenForBetting && ( <span className="flex items-center text-xs font-bold bg-green-500 text-white px-2.5 py-1 rounded-full shadow-sm"> <CheckCircleIcon className="h-4 w-4 mr-1.5" /> OPEN </span> )}
                            {isFinal && gameStatusDisplay && ( <span className={`px-2 py-0.5 font-semibold rounded-full bg-gray-700 text-gray-300 text-xs`}> {gameStatusDisplay} </span> )}
                            {!isOpenForBetting && !isFinal && gameStatusDisplay && ( <span className={`px-2 py-0.5 font-semibold rounded-full bg-yellow-600/40 text-yellow-200 text-xs`}> {gameStatusDisplay} </span> )}
                        </div>
                    </div>
                </div>

                <div className="relative">
                    {isFinal && game.home_score != null && game.away_score != null ? (
                        <div onClick={navigateToGameDetail} className="block px-3 py-4 sm:px-4 sm:py-5 text-center hover:bg-sleeper-surface-200/30 transition-colors cursor-pointer">
                            <p className="text-lg sm:text-xl font-bold text-sleeper-text-primary">{game.away_team} {game.away_score} @ {game.home_team} {game.home_score}</p>
                        </div>
                    ) : !isFinal && qb ? (
                        <div className="px-2 py-3 sm:px-3 sm:py-4 text-xs">
                            <div className="grid grid-cols-[minmax(0,_1fr)_repeat(3,_minmax(70px,_100px))] gap-x-1.5 sm:gap-x-2 mb-1.5 text-center text-xs font-bold text-sleeper-text-secondary uppercase tracking-wider">
                                <div className="text-left pl-1">Team</div>
                                <div className="py-1">Winner</div> {/* Geändert */}
                                <div className="py-1">Spread</div>
                                <div className="py-1">Total</div>
                            </div>
                            <div onClick={navigateToGameDetail} className="grid grid-cols-[minmax(0,_1fr)_repeat(3,_minmax(70px,_100px))] gap-x-1.5 sm:gap-x-2 items-center min-h-[48px] hover:bg-sleeper-surface-200/20 rounded px-1 py-1 group cursor-pointer">
                                <div className="font-bold text-base text-sleeper-text-primary truncate group-hover:text-sleeper-primary transition-colors pr-1 text-left">{game.home_team}</div> {/* Teamname hervorgehoben */}
                                <div>{renderQuickBetButtonForTable(getMoneylineOption('home'), game, 'h2h', 'home')}</div>
                                <div>{renderQuickBetButtonForTable(homeSpreadOption, game, 'spreads', 'home')}</div>
                                <div>{renderQuickBetButtonForTable(totalOverOption, game, 'totals', 'over')}</div>
                            </div>
                            <div onClick={navigateToGameDetail} className="grid grid-cols-[minmax(0,_1fr)_repeat(3,_minmax(70px,_100px))] gap-x-1.5 sm:gap-x-2 items-center min-h-[48px] hover:bg-sleeper-surface-200/20 rounded px-1 py-1 group cursor-pointer">
                                <div className="font-bold text-base text-sleeper-text-primary truncate group-hover:text-sleeper-primary transition-colors pr-1 text-left">{game.away_team}</div> {/* Teamname hervorgehoben */}
                                <div>{renderQuickBetButtonForTable(getMoneylineOption('away'), game, 'h2h', 'away')}</div>
                                <div>{renderQuickBetButtonForTable(awaySpreadOption, game, 'spreads', 'away')}</div>
                                <div>{renderQuickBetButtonForTable(totalUnderOption, game, 'totals', 'under')}</div>
                            </div>
                        </div>
                    ) : isOpenForBetting ? (
                        <div onClick={navigateToGameDetail} className="block px-3 py-3 sm:px-4 sm:py-4 mt-2 hover:bg-sleeper-surface-200/30 transition-colors cursor-pointer">
                            <p className="text-xs text-center text-sleeper-text-secondary py-1 italic">No quick bets available. Click to view all markets.</p>
                        </div>
                    ) : (
                        <div onClick={navigateToGameDetail} className="block px-3 py-4 sm:px-4 sm:py-5 text-center hover:bg-sleeper-surface-200/30 transition-colors cursor-pointer">
                            <p className="text-sm text-sleeper-text-secondary">View Game Details</p>
                        </div>
                    )}
                    {/* Der separate "View all bets" Button wurde entfernt */}
                </div>
            </div>
        );
    };

    return (
        <div className="space-y-6">
            {upcomingGames.length > 0 && (
                <div>
                    <h2 className="text-xl font-semibold text-sleeper-text-primary mb-2 sm:mb-3 px-1">Upcoming & Live</h2>
                    <div className="space-y-3 sm:space-y-4">
                        {upcomingGames.map((game) => renderGameCard(game, false))}
                    </div>
                </div>
            )}
            {!loading && !error && upcomingGames.length === 0 && allGames.length > 0 && (
                <div className="text-center py-6">
                    <InboxIcon className="mx-auto h-10 w-10 text-sleeper-text-secondary/70 mb-2" />
                    <p className="font-semibold text-sleeper-text-primary">No upcoming or live games at the moment.</p>
                    <p className="text-sm text-sleeper-text-secondary">Check back later or view results below.</p>
                </div>
            )}
            {finalGames.length > 0 && (
                <div>
                    <h2 className="text-xl font-semibold text-sleeper-text-primary mb-2 sm:mb-3 mt-6 sm:mt-8 px-1">Results</h2>
                    <div className="space-y-3 sm:space-y-4">
                        {finalGames.map((game) => renderGameCard(game, true))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default GameList;