// src/components/GameDetailPage.tsx
import React, { useEffect, useState } from 'react';
import { useParams, Link as RouterLink } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { type AvailableBetWithBetType, type Game as GameBaseType } from './GameList'; // Re-use types
import { useDashboardContext } from '../App'; // Use the context from DashboardLayout

interface GameDetail extends GameBaseType {
    available_bets: AvailableBetWithBetType[];
}

const extractPlayerName = (selectionName: string, betTypeName: string): string | null => {
    if (betTypeName.toLowerCase().includes('player')) {
        const parts = selectionName.split(' ');
        let nameParts = [];
        for (const part of parts) {
            if (['Over', 'Under', 'Yes', 'No', 'Pts', 'Yds', 'TDs', 'Receptions', 'Sacks', 'INTs', '+', '-'].some(term => part.startsWith(term)) || !isNaN(parseFloat(part))) {
                break;
            }
            nameParts.push(part);
        }
        return nameParts.length > 0 ? nameParts.join(' ') : `Player (${selectionName.substring(0,15)}...)`;
    }
    return null;
};

const groupBetsByMarketForDetailPage = (bets: AvailableBetWithBetType[], gameHomeTeam: string, gameAwayTeam: string) => {
    const mainMarkets = { moneyline: [] as AvailableBetWithBetType[], spread: [] as AvailableBetWithBetType[], total: [] as AvailableBetWithBetType[] };
    const periodMarkets: Record<string, { name: string, moneyline: AvailableBetWithBetType[], spread: AvailableBetWithBetType[], total: AvailableBetWithBetType[], teamTotals: AvailableBetWithBetType[], evenOdd: AvailableBetWithBetType[] }> = {};
    const playerProps: Record<string, Record<string, AvailableBetWithBetType[]>> = {};
    const teamProps: AvailableBetWithBetType[] = []; // For game-level team totals & E/O not tied to a specific sub-period

    bets.forEach(bet => {
        const key = bet.bet_types.api_market_key;
        const periodMatch = key.match(/^(1q|2q|3q|4q|1h|2h)_/);
        const period = periodMatch ? periodMatch[1].toUpperCase() : null;

        if (key.startsWith('player_')) {
            const playerName = extractPlayerName(bet.selection_name, bet.bet_types.name) || "Unknown Player";
            // A more refined propType, trying to get the core stat name
            let propType = bet.bet_types.name.replace(/Player\s*/i, '').replace(/\s*O\/U|\s*Yes\/No/i, '').trim();
            if (propType.toLowerCase().includes(playerName.toLowerCase())) { // Avoid player name in prop type display
                propType = propType.replace(new RegExp(playerName, 'i'), '').trim();
            }

            if (!playerProps[playerName]) playerProps[playerName] = {};
            if (!playerProps[playerName][propType]) playerProps[playerName][propType] = [];
            playerProps[playerName][propType].push(bet);
        } else if (period) {
            if (!periodMarkets[period]) periodMarkets[period] = { name: `${period} Bets`, moneyline: [], spread: [], total: [], teamTotals: [], evenOdd: [] };
            if (key.endsWith('_ml')) periodMarkets[period].moneyline.push(bet);
            else if (key.endsWith('_sp')) periodMarkets[period].spread.push(bet);
            else if (key.endsWith('_totals_ou')) periodMarkets[period].total.push(bet);
            else if (key.includes('_team_points_') && key.endsWith('_ou')) periodMarkets[period].teamTotals.push(bet);
            else if (key.includes('_eo')) periodMarkets[period].evenOdd.push(bet);
        } else if (key === 'h2h') {
            mainMarkets.moneyline.push(bet);
        } else if (key === 'spreads') {
            mainMarkets.spread.push(bet);
        } else if (key === 'totals') {
            mainMarkets.total.push(bet);
        } else if ((key.startsWith('team_points_') && key.endsWith('_ou')) ||
            (key.startsWith('game_total_eo')) ||
            (key.startsWith('team_points_') && key.endsWith('_eo'))) {
            teamProps.push(bet);
        }
    });
    return { mainMarkets, periodMarkets, playerProps, teamProps };
};


const GameDetailPage: React.FC = () => {
    const { gameId } = useParams<{ gameId: string }>();
    const { onSelectBet, selectedBetIds } = useDashboardContext();
    const [gameDetail, setGameDetail] = useState<GameDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!gameId) {
            setError("No game ID provided.");
            setLoading(false);
            return;
        }

        const fetchGameDetails = async () => {
            setLoading(true);
            setError(null);
            try {
                const { data: gameData, error: gameError } = await supabase
                    .from('games')
                    .select(`
                        id, api_game_id, home_team, away_team, game_time, status,
                        available_bets!inner (
                            id, selection_name, odds, line, is_active, source_bookmaker,
                            bet_types!inner (name, api_market_key)
                        )
                    `)
                    .eq('id', gameId)
                    .eq('available_bets.is_active', true)
                    .single();

                if (gameError) throw gameError;
                if (!gameData) {
                    setError("Game not found or no active odds available.");
                    setGameDetail(null);
                } else {
                    const betsWithGameContext = (gameData.available_bets as AvailableBetWithBetType[]).map(b => ({
                        ...b,
                        games: {
                            id: gameData.id,
                            home_team: gameData.home_team,
                            away_team: gameData.away_team,
                            game_time: gameData.game_time
                        }
                    }));
                    setGameDetail({ ...gameData, available_bets: betsWithGameContext });
                }
            } catch (err: any) {
                console.error("Error fetching game details:", err);
                setError(err.message || "Failed to load game details.");
                setGameDetail(null);
            } finally {
                setLoading(false);
            }
        };

        fetchGameDetails();
    }, [gameId]);

    const BetButton: React.FC<{bet: AvailableBetWithBetType, children: React.ReactNode, customClass?: string }> =
        ({ bet, children, customClass = '' }) => {
            const isSelected = selectedBetIds.includes(bet.id);
            const baseButtonClass = `text-white p-2.5 rounded-md text-xs sm:text-sm text-center transition-all duration-150 ease-in-out shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-sleeper-surface w-full `;

            const buttonClasses = isSelected
                ? 'bg-sleeper-accent hover:bg-opacity-80 ring-2 ring-sleeper-accent transform scale-105'
                : 'bg-sleeper-primary hover:bg-sleeper-primary-hover focus:ring-sleeper-primary';
            return (
                <button
                    key={bet.id}
                    onClick={() => onSelectBet(bet, false)}
                    className={`${baseButtonClass} ${buttonClasses} ${customClass}`}
                    title={`Select: ${bet.selection_name}`}
                >
                    {children}
                </button>
            );
        };

    const renderMarketGroup = (title: string, bets: AvailableBetWithBetType[], showLine: boolean = true, cols: number = 2) => {
        if (!bets || bets.length === 0) return null;
        return (
            <div className="mb-4">
                <h4 className="text-sm font-semibold text-sleeper-text-secondary mb-2 uppercase tracking-wider">{title}</h4>
                <div className={`grid grid-cols-1 md:grid-cols-${Math.min(cols, bets.length, 3)} gap-2`}>
                    {bets.sort((a,b) => a.selection_name.localeCompare(b.selection_name)).map(bet => (
                        <div key={bet.id}>
                            <BetButton bet={bet}>
                                <span className="block truncate font-medium">
                                    {bet.selection_name}
                                    {showLine && bet.line !== null && ` (${bet.line > 0 ? `+${bet.line.toFixed(1)}` : bet.line.toFixed(1)})`}
                                </span>
                                <span className="block text-lg font-bold">{bet.odds.toFixed(2)}</span>
                            </BetButton>
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    if (loading) return <div className="p-6 text-center text-sleeper-text-secondary">Loading game details...</div>;
    if (error) return <div className="p-6 text-center text-sleeper-error">{error}</div>;
    if (!gameDetail) return <div className="p-6 text-center text-sleeper-text-secondary">Game data not available.</div>;

    const { mainMarkets, periodMarkets, playerProps, teamProps } = groupBetsByMarketForDetailPage(gameDetail.available_bets, gameDetail.home_team, gameDetail.away_team);
    const gameDate = new Date(gameDetail.game_time);

    return (
        <div className="p-4 sm:p-6 bg-sleeper-surface border border-sleeper-border rounded-xl shadow-xl">
            <div className="mb-6 pb-4 border-b border-sleeper-border">
                <RouterLink to="/" className="text-sm text-sleeper-accent hover:underline mb-3 inline-block">← All Games</RouterLink>
                <h1 className="text-2xl sm:text-3xl font-bold text-sleeper-primary">
                    {gameDetail.away_team} <span className="text-sleeper-text-secondary text-xl font-normal">@</span> {gameDetail.home_team}
                </h1>
                <p className="text-sm text-sleeper-text-secondary mt-1">
                    {gameDate.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                    <span className="mx-1.5">·</span>
                    {gameDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}
                </p>
            </div>

            {gameDetail.available_bets.length > 0 ? (
                <div className="space-y-6">
                    {renderMarketGroup("Moneyline", mainMarkets.moneyline, false)}
                    {renderMarketGroup("Point Spread", mainMarkets.spread, true)}
                    {renderMarketGroup("Total Points", mainMarkets.total, true)}

                    {Object.entries(periodMarkets).sort(([keyA], [keyB]) => { // Sort periods logically
                        const order = ['1Q', '1H', '2Q', '3Q', '2H', '4Q'];
                        return order.indexOf(keyA) - order.indexOf(keyB);
                    }).map(([period, markets]) => (
                        (markets.moneyline.length > 0 || markets.spread.length > 0 || markets.total.length > 0 || markets.teamTotals.length > 0 || markets.evenOdd.length > 0) && (
                            <div key={period}>
                                <h3 className="text-xl font-semibold text-sleeper-primary mt-6 mb-3 border-b border-sleeper-border pb-1.5">{period} Bets</h3>
                                <div className="space-y-4">
                                    {renderMarketGroup(`${period} Moneyline`, markets.moneyline, false)}
                                    {renderMarketGroup(`${period} Spread`, markets.spread, true)}
                                    {renderMarketGroup(`${period} Total`, markets.total, true)}
                                    {renderMarketGroup(`${period} Team Totals`, markets.teamTotals, true)}
                                    {renderMarketGroup(`${period} Even/Odd`, markets.evenOdd, false)}
                                </div>
                            </div>
                        )
                    ))}

                    {Object.keys(playerProps).length > 0 && (
                        <div>
                            <h3 className="text-xl font-semibold text-sleeper-primary mt-6 mb-3 border-b border-sleeper-border pb-1.5">Player Props</h3>
                            {Object.entries(playerProps).sort(([aName],[bName]) => aName.localeCompare(bName)).map(([playerName, propsByPlayer]) => (
                                <div key={playerName} className="mb-4 p-3 bg-sleeper-bg-secondary rounded-lg border border-sleeper-border">
                                    <h4 className="text-md font-bold text-sleeper-text-primary mb-2">{playerName}</h4>
                                    <div className="space-y-3">
                                        {Object.entries(propsByPlayer).sort(([aProp],[bProp]) => aProp.localeCompare(bProp)).map(([propType, bets]) => (
                                            renderMarketGroup(propType, bets, true, bets.length > 1 ? 2 : 1)
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {teamProps.length > 0 && (
                        <div>
                            <h3 className="text-xl font-semibold text-sleeper-primary mt-6 mb-3 border-b border-sleeper-border pb-1.5">Other Game Props</h3>
                            {renderMarketGroup("Game Props", teamProps, true)}
                        </div>
                    )}
                </div>
            ) : (
                <p className="text-center text-sleeper-text-secondary py-8">No specific odds currently available for this game. Try the main game list.</p>
            )}
        </div>
    );
};

export default GameDetailPage;