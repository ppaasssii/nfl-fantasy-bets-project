// frontend/src/components/GameDetailPage.tsx
import React, { useEffect, useState, useCallback, Fragment } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { toast } from 'react-toastify';
import { Tab, Disclosure } from '@headlessui/react';
import {
    ChevronUpIcon,
    ArrowLeftIcon,
    NoSymbolIcon,
    ArrowPathIcon,
    CalendarDaysIcon,
    ExclamationTriangleIcon,
    PlayCircleIcon,
    LockClosedIcon,
    CheckCircleIcon
} from '@heroicons/react/24/outline';

import { useDashboardOutletContext } from '../App';
import { americanToDecimal } from '../utils/oddsConverter';
import type { GameForListV2 } from './GameList'; // Für den gameContext

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

export interface AvailableBetDetail {
    id: number;
    game_id: number;
    bet_type_id: number;
    selection_name: string;
    odds: number;
    line?: number | null;
    is_active: boolean;
    is_winning_outcome?: boolean | null;
    bet_type_name: string;
    home_team: string;
    away_team: string;
    bet_type_api_key: string;
    player_name?: string;
}

interface MarketGroup {
    groupName: string;
    options: AvailableBetDetail[];
    isOverUnderPair?: boolean;
    overOption?: AvailableBetDetail;
    underOption?: AvailableBetDetail;
    commonLine?: number | null;
}

interface ProcessedBetCategory {
    categoryKey: string;
    displayName: string;
    markets: MarketGroup[];
    icon?: React.ElementType;
}

const extractPlayerNameForGrouping = (selectionName: string, betTypeName: string): string | undefined => {
    if (!betTypeName.toLowerCase().includes('player')) return undefined;
    const lcSelection = selectionName.toLowerCase();
    const keywords = [
        ' points', ' rebounds', ' assists', ' touchdowns', ' receiving yards', ' rushing yards', ' passing yards',
        ' over', ' under', ' yes', ' no', ' to score', ' first touchdown scorer', ' last touchdown scorer',
        ' player to record'
    ];
    let shortestKeywordIndex = -1;
    let extractedName = selectionName;

    for (const kw of keywords) {
        const index = lcSelection.indexOf(kw);
        if (index > -1) {
            if (shortestKeywordIndex === -1 || index < shortestKeywordIndex) {
                shortestKeywordIndex = index;
                extractedName = selectionName.substring(0, index).trim();
            }
        }
    }
    if (extractedName.length < 3 || keywords.some(kw => extractedName.toLowerCase().endsWith(kw.trim()))) {
        if (!lcSelection.startsWith('over ') && !lcSelection.startsWith('under ') && !lcSelection.startsWith('yes ') && !lcSelection.startsWith('no ')) {
            if (selectionName.split(' ').length <= 3 && selectionName.length > 2) {
                if (!['anytime', 'first', 'last', 'player'].some(g => selectionName.toLowerCase().includes(g))) {
                    return selectionName;
                }
            }
        }
        return undefined;
    }
    return extractedName;
};


const GameDetailPage: React.FC = () => {
    const { dbGameId } = useParams<{ dbGameId: string }>();
    const navigate = useNavigate();
    const dashboardContext = useDashboardOutletContext();
    const addToBetSlip = dashboardContext?.addToBetSlip;
    const isOddInBetSlip = dashboardContext?.isOddInBetSlip;

    const [game, setGame] = useState<Game | null>(null);
    const [processedBetCategories, setProcessedBetCategories] = useState<ProcessedBetCategory[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [currentTime, setCurrentTime] = useState(new Date());
    // KORREKTUR: State-Variable und Setter konsistent verwenden
    const [visiblePlayerPropsCount, setVisiblePlayerPropsCount] = useState<Record<string, number>>({});

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 30000);
        return () => clearInterval(timer);
    }, []);

    const fetchGameDetails = useCallback(async () => {
        if (!dbGameId) { setError("Game ID is missing."); setLoading(false); return; }
        setLoading(true); setError(null);
        try {
            const { data: gameData, error: gameError } = await supabase
                .from('games').select('*').eq('id', parseInt(dbGameId, 10)).single();
            if (gameError) throw gameError;
            if (!gameData) throw new Error("Game not found.");
            setGame(gameData as Game);

            const { data: availableBetsData, error: betsError } = await supabase
                .from('available_bets').select(`*, bet_types (id, name, api_market_key, description)`)
                .eq('game_id', parseInt(dbGameId, 10)).eq('is_active', true)
                .order('bet_type_id').order('line', { nullsFirst: true }).order('selection_name');
            if (betsError) throw betsError;

            const rawCategories: Record<string, {
                displayName: string;
                marketsData: Record<string, AvailableBetDetail[]>;
                icon?: React.ElementType;
            }> = {
                h2h: { displayName: "Winner", marketsData: {} },
                spreads: { displayName: "Spread", marketsData: {} },
                totals: { displayName: "Total", marketsData: {} },
                player_touchdowns: { displayName: "Touchdowns", marketsData: {} },
                player_passing_yards: { displayName: "Passing Yards", marketsData: {} },
                player_rushing_yards: { displayName: "Rushing Yards", marketsData: {} },
                player_receiving_yards: { displayName: "Receiving Yards", marketsData: {} },
                other_player_props: { displayName: "Other Player Props", marketsData: {} },
                other: { displayName: "Other Bets", marketsData: {} }
            };

            availableBetsData?.forEach(bet => {
                if (!bet.bet_types) return;
                const betType = bet.bet_types as BetTypeInterface;
                const extractedPlayer = extractPlayerNameForGrouping(bet.selection_name, betType.name);

                const enrichedBet: AvailableBetDetail = {
                    ...bet, bet_type_name: betType.name, home_team: gameData.home_team,
                    away_team: gameData.away_team, bet_type_api_key: betType.api_market_key,
                    player_name: extractedPlayer
                };

                let determinedCategoryKey = "other";
                let groupName = betType.name;

                if (betType.api_market_key === 'h2h') determinedCategoryKey = 'h2h';
                else if (betType.api_market_key === 'spreads') determinedCategoryKey = 'spreads';
                else if (betType.api_market_key === 'totals') determinedCategoryKey = 'totals';
                else if (enrichedBet.player_name) {
                    const btNameLower = betType.name.toLowerCase();
                    if (btNameLower.includes('touchdown')) determinedCategoryKey = 'player_touchdowns';
                    else if (btNameLower.includes('pass') && btNameLower.includes('yard')) determinedCategoryKey = 'player_passing_yards';
                    else if (btNameLower.includes('rush') && btNameLower.includes('yard')) determinedCategoryKey = 'player_rushing_yards';
                    else if (btNameLower.includes('receiv') && btNameLower.includes('yard')) determinedCategoryKey = 'player_receiving_yards';
                    else determinedCategoryKey = 'other_player_props';
                    groupName = enrichedBet.player_name;
                }

                if (!rawCategories[determinedCategoryKey]) {
                    rawCategories[determinedCategoryKey] = { displayName: betType.name, marketsData: {} };
                }
                if (!rawCategories[determinedCategoryKey].marketsData[groupName]) {
                    rawCategories[determinedCategoryKey].marketsData[groupName] = [];
                }
                rawCategories[determinedCategoryKey].marketsData[groupName].push(enrichedBet);
            });

            const finalProcessedCategories: ProcessedBetCategory[] = Object.entries(rawCategories)
                .map(([key, categoryData]) => {
                    const markets: MarketGroup[] = Object.entries(categoryData.marketsData)
                        .map(([marketGroupName, options]) => {
                            if (key.includes('player_touchdowns')) {
                                options.sort((a: AvailableBetDetail, b: AvailableBetDetail) => a.odds - b.odds); // Typen hinzugefügt
                            } else {
                                options.sort((a: AvailableBetDetail, b: AvailableBetDetail) => { // Typen hinzugefügt
                                    if (a.selection_name.toLowerCase().startsWith('over ')) return -1;
                                    if (b.selection_name.toLowerCase().startsWith('over ')) return 1;
                                    return a.selection_name.localeCompare(b.selection_name);
                                });
                            }

                            if ((key === 'totals' || key.includes('yards')) && options.length >= 2) {
                                const overOption = options.find(o => o.selection_name.toLowerCase().startsWith('over '));
                                const underOption = options.find(o => o.selection_name.toLowerCase().startsWith('under '));
                                // Stelle sicher, dass opt1.line nicht undefined ist, bevor es in Set verwendet wird
                                if (overOption && underOption && (overOption.line === underOption.line || (overOption.line == null && underOption.line == null))) {
                                    return {
                                        groupName: marketGroupName, options: [],
                                        isOverUnderPair: true, overOption, underOption,
                                        commonLine: overOption.line === undefined ? null : overOption.line // undefined zu null
                                    };
                                }
                            }
                            return { groupName: marketGroupName, options };
                        })
                        .filter(market => market.options.length > 0 || market.isOverUnderPair);

                    return {
                        categoryKey: key,
                        displayName: categoryData.displayName,
                        markets: markets.sort((a: MarketGroup, b: MarketGroup) => a.groupName.localeCompare(b.groupName)), // Typen hinzugefügt
                        icon: categoryData.icon
                    };
                })
                .filter(category => category.markets.length > 0)
                .sort((a: ProcessedBetCategory, b: ProcessedBetCategory) => { // Typen hinzugefügt
                    const order = ['Winner', 'Spread', 'Total', 'Touchdowns', 'Passing Yards', 'Rushing Yards', 'Receiving Yards', 'Other Player Props', 'Other Bets'];
                    const indexA = order.indexOf(a.displayName);
                    const indexB = order.indexOf(b.displayName);
                    if (indexA !== -1 && indexB !== -1) return indexA - indexB;
                    if (indexA !== -1) return -1;
                    if (indexB !== -1) return 1;
                    return a.displayName.localeCompare(b.displayName);
                });

            setProcessedBetCategories(finalProcessedCategories);

        } catch (e: any) {
            console.error("Error fetching game details:", e);
            setError(e.message || "Failed to load game details.");
            toast.error(e.message || "Could not fetch game details.");
        } finally { setLoading(false); }
    }, [dbGameId]);

    useEffect(() => { fetchGameDetails(); }, [fetchGameDetails]);

    const handleBetSelection = (odd: AvailableBetDetail) => {
        if (!addToBetSlip || !isOddInBetSlip || !game) { toast.warn("Cannot process bet selection."); return; }
        const gameStartTime = new Date(game.game_time);
        const isFinalBackend = game.status === 'finished' || game.status === 'FT' || game.status === 'Final';
        const isLiveBackend = game.status === 'live' || game.status === 'inprogress';
        const isPastGameTimeClient = currentTime >= gameStartTime;
        const isClientSideBlocked = isPastGameTimeClient && !isFinalBackend && !isLiveBackend;
        if (isFinalBackend || isLiveBackend || isClientSideBlocked) { toast.info("Betting is closed for this game."); return; }
        const gameContextForSlip: GameForListV2 = {
            id: game.id, api_game_id: game.api_game_id, home_team: game.home_team,
            away_team: game.away_team, game_time: game.game_time, status: game.status,
            home_score: game.home_score, away_score: game.away_score, quick_bets: null,
        };
        addToBetSlip(odd, gameContextForSlip);
    };

    const formatGameTime = (gameTimeStr: string | undefined): string => {
        if (!gameTimeStr) return "N/A";
        const date = new Date(gameTimeStr);
        return `${date.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' })} - ${date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr`;
    };

    const renderOddButton = (odd: AvailableBetDetail, displayName: string, isGameBettingClosed: boolean) => {
        const isSelected = isOddInBetSlip ? isOddInBetSlip(odd.id) : false;
        const decimalOddForDisplay = americanToDecimal(odd.odds);
        let lineDisplay = "";
        if (odd.line != null && (displayName.toLowerCase().startsWith('over') || displayName.toLowerCase().startsWith('under') || odd.bet_type_api_key === 'spreads')) {
            lineDisplay = `${odd.line > 0 ? '+' : ''}${odd.line.toFixed(1)}`;
        }
        let finalDisplayName = displayName;
        if (lineDisplay && (displayName.toLowerCase().startsWith('over') || displayName.toLowerCase().startsWith('under'))) {
            finalDisplayName = displayName.split(' ')[0];
        } else if (lineDisplay && odd.bet_type_api_key === 'spreads' && game) { // game hinzugefügt für Zugriff auf home_team/away_team
            finalDisplayName = displayName.replace(lineDisplay, '').replace(game.home_team || '', '').replace(game.away_team || '', '').trim();
            if (finalDisplayName === '') finalDisplayName = (displayName.includes(game.home_team || '')) ? 'Home' : 'Away';
        }

        return (
            <button
                key={odd.id}
                onClick={() => handleBetSelection(odd)}
                disabled={isGameBettingClosed}
                className={`w-full flex items-center justify-between p-2.5 rounded-md border text-center transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-sleeper-primary focus-visible:ring-offset-2 focus-visible:ring-offset-sleeper-surface
                    ${isGameBettingClosed
                    ? 'bg-gray-700/40 border-gray-600 text-gray-400 cursor-not-allowed opacity-70'
                    : isSelected
                        ? 'bg-sleeper-primary text-white border-sleeper-primary shadow-md'
                        : 'bg-sleeper-surface-200 text-sleeper-text-primary border-sleeper-border hover:border-sleeper-primary/70 hover:bg-sleeper-primary/10'
                }`}
                title={isGameBettingClosed ? "Betting closed" : (isSelected ? `Remove "${odd.selection_name}" from slip` : `Add "${odd.selection_name}" to slip`)}
            >
                <span className="text-sm font-medium truncate text-left mr-2">{finalDisplayName} {lineDisplay && <span className="text-xs text-sleeper-text-secondary/90">{lineDisplay}</span>}</span>
                <span className="text-sm font-bold">{decimalOddForDisplay.toFixed(2)}</span>
            </button>
        );
    };

    if (loading) {
        return ( <div className="text-center py-10"> <ArrowPathIcon className="animate-spin h-8 w-8 text-sleeper-primary mx-auto mb-3" /> <p className="text-lg font-semibold text-sleeper-text-primary">Loading Game Details...</p> </div> );
    }
    if (error) {
        return ( <div className="text-center py-10 bg-sleeper-surface p-6 rounded-lg shadow-md border border-sleeper-error/30"> <ExclamationTriangleIcon className="h-10 w-10 text-sleeper-error mx-auto mb-3" /> <p className="text-lg font-semibold text-sleeper-text-primary mb-1">Error Loading Game</p> <p className="text-sm text-sleeper-text-secondary mb-4">{error}</p> <Link to="/" className="px-4 py-2 bg-sleeper-primary hover:bg-sleeper-primary-hover text-white text-sm font-semibold rounded-md transition-colors"> Back to Games </Link> </div> );
    }
    if (!game) {
        return ( <div className="text-center py-10"> <NoSymbolIcon className="h-10 w-10 text-sleeper-text-secondary mx-auto mb-3" /> <p className="text-xl font-semibold text-sleeper-text-primary">Game not found.</p> </div> );
    }

    const gameStartTime = new Date(game.game_time);
    const isFinalBackend = game.status === 'finished' || game.status === 'FT' || game.status === 'Final';
    const isLiveBackend = game.status === 'live' || game.status === 'inprogress';
    const isPastGameTimeClient = currentTime >= gameStartTime;
    const isClientSideBlocked = isPastGameTimeClient && !isFinalBackend && !isLiveBackend;
    const isBettingEffectivelyClosed = isFinalBackend || isLiveBackend || isClientSideBlocked;

    let statusLabelText = ""; let statusLabelClasses = ""; let StatusIcon = null;
    if (isFinalBackend) { statusLabelText = (game.status.toUpperCase() || "FINAL"); statusLabelClasses = "bg-gray-700 text-gray-300";
    } else if (isLiveBackend) { statusLabelText = "LIVE"; statusLabelClasses = "bg-red-500 text-white animate-pulse"; StatusIcon = PlayCircleIcon;
    } else if (isClientSideBlocked) { statusLabelText = "BLOCKED"; statusLabelClasses = "bg-orange-600 text-white"; StatusIcon = LockClosedIcon;
    } else if (game.status === 'scheduled' || game.status === 'NS' || game.status === 'upcoming') { statusLabelText = "OPEN"; statusLabelClasses = "bg-green-500 text-white"; StatusIcon = CheckCircleIcon;
    } else if (game.status) { statusLabelText = game.status.toUpperCase(); statusLabelClasses = "bg-yellow-600/40 text-yellow-200"; }

    return (
        <div className="pb-16 sm:pb-8">
            <button onClick={() => navigate(-1)} className="inline-flex items-center text-sm text-sleeper-text-secondary hover:text-sleeper-primary mb-3 group">
                <ArrowLeftIcon className="h-5 w-5 mr-1.5 transition-transform duration-150 ease-in-out group-hover:-translate-x-1" />
                Back
            </button>

            <div className="bg-sleeper-surface p-3 sm:p-4 rounded-lg shadow-md mb-4 sm:mb-6 border border-sleeper-border/60">
                <div className="flex flex-col sm:flex-row justify-between items-start">
                    <div className="mb-2 sm:mb-0 flex-grow">
                        <h1 className="text-base sm:text-lg font-bold text-sleeper-text-primary" title={`${game.away_team} @ ${game.home_team}`}>
                            {game.away_team} <span className="text-sleeper-text-secondary/70 mx-0.5 sm:mx-1">@</span> {game.home_team}
                        </h1>
                        <p className="text-xs sm:text-sm text-sleeper-text-secondary mt-0.5 flex items-center">
                            <CalendarDaysIcon className="h-3.5 w-3.5 mr-1.5 text-sleeper-text-secondary/70 flex-shrink-0" />
                            {formatGameTime(game.game_time)}
                        </p>
                    </div>
                    <div className="flex-shrink-0 flex flex-col items-end space-y-1.5 mt-2 sm:mt-0">
                        {statusLabelText && (
                            <span className={`flex items-center text-xxs font-bold px-1.5 py-px sm:px-2 sm:py-0.5 rounded-full shadow-sm ${statusLabelClasses}`}>
                                {StatusIcon && <StatusIcon className="h-2.5 w-2.5 sm:h-3 sm:w-3 mr-0.5 sm:mr-1" />}
                                {statusLabelText}
                            </span>
                        )}
                        {(game.home_score != null && game.away_score != null && (isFinalBackend || isLiveBackend || isClientSideBlocked)) && (
                            <div className="text-lg sm:text-xl font-bold text-sleeper-text-primary whitespace-nowrap">
                                {game.away_score} - {game.home_score}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {isBettingEffectivelyClosed && !isFinalBackend && (
                <div className="mb-4 p-3 bg-orange-600/10 border border-orange-600/30 text-orange-200 rounded-lg text-xs sm:text-sm flex items-center justify-center">
                    <LockClosedIcon className="h-4 w-4 sm:h-5 sm:w-5 mr-2 flex-shrink-0"/>
                    Betting is currently suspended as the game is live or about to start.
                </div>
            )}

            {processedBetCategories.length === 0 && !loading && !isBettingEffectivelyClosed && (
                <div className="text-center py-6 bg-sleeper-surface p-4 rounded-lg shadow-md border border-sleeper-border/50">
                    <NoSymbolIcon className="h-8 w-8 sm:h-10 sm:w-10 text-sleeper-text-secondary/70 mx-auto mb-2" />
                    <p className="text-sm sm:text-base font-semibold text-sleeper-text-primary mb-1">No Bets Available</p>
                    <p className="text-xs sm:text-sm text-sleeper-text-secondary">Market information may be updated closer to game time.</p>
                </div>
            )}

            {processedBetCategories.length > 0 && (
                <Tab.Group>
                    <Tab.List className="flex space-x-1 sm:space-x-1.5 rounded-lg bg-sleeper-surface-200 p-1 border border-sleeper-border mb-3 sm:mb-4 overflow-x-auto custom-scrollbar">
                        {processedBetCategories.map((category) => (
                            <Tab key={category.categoryKey} as={Fragment}>
                                {({ selected }) => (
                                    <button className={`whitespace-nowrap rounded-md text-xs font-medium leading-5 px-2.5 py-2 sm:px-3 focus:outline-none focus-visible:ring-2 ring-offset-1 ring-offset-sleeper-surface-200 ring-white ring-opacity-60 ${selected ? 'bg-sleeper-primary text-white shadow' : 'text-sleeper-text-secondary hover:bg-sleeper-surface-300/70 hover:text-sleeper-text-primary'}`}>
                                        {category.displayName}
                                    </button>
                                )}
                            </Tab>
                        ))}
                    </Tab.List>
                    <Tab.Panels className="mt-1">
                        {processedBetCategories.map((category) => (
                            <Tab.Panel key={category.categoryKey} className="space-y-2.5 sm:space-y-3 outline-none">
                                {category.markets.map((market, marketIdx) => {
                                    const initialVisibleCount = (category.categoryKey.includes('player_') && !market.isOverUnderPair) ? 3 : market.options.length;
                                    const currentVisible = visiblePlayerPropsCount[market.groupName + marketIdx] || initialVisibleCount; // KORREKTUR
                                    const canShowMore = market.options.length > initialVisibleCount && currentVisible < market.options.length;

                                    return (
                                        <Disclosure key={market.groupName + marketIdx} defaultOpen={category.markets.length === 1 || market.isOverUnderPair || market.groupName.toLowerCase().includes('game') || category.displayName === 'Winner' || category.displayName === 'Spread' || category.displayName === 'Total' || category.categoryKey.includes('player_')}>
                                            {({ open }) => (
                                                <div className="bg-sleeper-surface-200/40 p-0.5 rounded-lg border border-sleeper-border/30">
                                                    <Disclosure.Button className="flex justify-between w-full px-3 py-3 text-left text-sm font-semibold text-sleeper-text-primary hover:bg-sleeper-surface-300/50 rounded-md focus:outline-none focus-visible:ring focus-visible:ring-sleeper-primary focus-visible:ring-opacity-75">
                                                        <span>{market.groupName}</span>
                                                        <ChevronUpIcon className={`${open ? 'rotate-180' : ''} w-5 h-5 text-sleeper-text-secondary group-hover:text-sleeper-primary transition-transform`} />
                                                    </Disclosure.Button>
                                                    <Disclosure.Panel className="px-1.5 py-2 sm:px-2 text-sm">
                                                        {market.isOverUnderPair && market.overOption && market.underOption ? (
                                                            <div className="space-y-1.5">
                                                                {market.commonLine != null && (
                                                                    <div className="text-center text-xs text-sleeper-text-secondary mb-1">
                                                                        Line: <span className="font-semibold">{market.commonLine.toFixed(1)}</span>
                                                                    </div>
                                                                )}
                                                                <div className="grid grid-cols-2 gap-2">
                                                                    {renderOddButton(market.overOption, `Over ${market.commonLine?.toFixed(1)}`, isBettingEffectivelyClosed)}
                                                                    {renderOddButton(market.underOption, `Under ${market.commonLine?.toFixed(1)}`, isBettingEffectivelyClosed)}
                                                                </div>
                                                            </div>
                                                        ) : market.options.length > 0 ? (
                                                            <div className="space-y-1.5">
                                                                {market.options.slice(0, currentVisible).map(odd => {
                                                                    let displayName = odd.selection_name;
                                                                    if (market.groupName === odd.player_name && odd.player_name) {
                                                                        displayName = displayName.replace(odd.player_name, '').trim();
                                                                        if (displayName.toLowerCase().startsWith('over') || displayName.toLowerCase().startsWith('under')) {
                                                                            displayName = `${displayName.split(' ')[0]} ${odd.line ? odd.line.toFixed(1) : ''}`.trim();
                                                                        }
                                                                    }
                                                                    return renderOddButton(odd, displayName || odd.selection_name, isBettingEffectivelyClosed);
                                                                })}
                                                                {canShowMore && (
                                                                    <button
                                                                        onClick={() => setVisiblePlayerPropsCount((prev: Record<string, number>) => ({...prev, [market.groupName + marketIdx]: market.options.length}))} // KORREKTUR
                                                                        className="mt-2.5 w-full text-xs text-sleeper-primary hover:text-sleeper-primary-hover font-semibold py-2 rounded-md bg-sleeper-surface hover:bg-sleeper-surface-200/70"
                                                                    >
                                                                        Show All ({market.options.length})
                                                                    </button>
                                                                )}
                                                            </div>
                                                        ) : <p className="text-center text-xs text-sleeper-text-secondary py-2">No options for this market.</p>}
                                                    </Disclosure.Panel>
                                                </div>
                                            )}
                                        </Disclosure>
                                    );
                                })}
                                {category.markets.length === 0 && ( <p className="text-center text-sleeper-text-secondary py-4">No markets found for {category.displayName}.</p> )}
                            </Tab.Panel>
                        ))}
                    </Tab.Panels>
                </Tab.Group>
            )}
        </div>
    );
};
export default GameDetailPage;