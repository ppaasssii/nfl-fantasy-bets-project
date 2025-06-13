// src/components/GameDetailPage.tsx
import React, { useEffect, useState, Fragment, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { toast } from 'react-toastify';
import { Tab } from '@headlessui/react';
import { ArrowLeftIcon, ArrowPathIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import OddButton from './OddButton';
import { type GameDetails, type Market, type StructuredPlayerProps } from '../types';

const groupPlayerMarkets = (markets: Market[]): StructuredPlayerProps => {
    const props: StructuredPlayerProps = {
        passing_yards: {}, rushing_yards: {}, receiving_yards: {}, touchdowns: {},
    };

    markets.forEach(market => {
        if (!market.player_name) return;
        const playerName = market.player_name;

        // Initialisiere die Objekte für jeden Spieler, falls sie noch nicht existieren
        if (!props.touchdowns[playerName]) {
            props.touchdowns[playerName] = { anytime: { yes: null, no: null }, first: { yes: null, no: null } };
        }
        if (!props.passing_yards[playerName]) props.passing_yards[playerName] = { over: null, under: null };
        if (!props.rushing_yards[playerName]) props.rushing_yards[playerName] = { over: null, under: null };
        if (!props.receiving_yards[playerName]) props.receiving_yards[playerName] = { over: null, under: null };

        const marketNameLower = market.market_name.toLowerCase();

        // Yardage Props
        if (marketNameLower.includes('passing yards')) {
            const key = 'passing_yards';
            props[key][playerName].over = market.options.find(o => o.api_side_id === 'over') || props[key][playerName].over;
            props[key][playerName].under = market.options.find(o => o.api_side_id === 'under') || props[key][playerName].under;
        } else if (marketNameLower.includes('rushing yards')) {
            const key = 'rushing_yards';
            props[key][playerName].over = market.options.find(o => o.api_side_id === 'over') || props[key][playerName].over;
            props[key][playerName].under = market.options.find(o => o.api_side_id === 'under') || props[key][playerName].under;
        } else if (marketNameLower.includes('receiving yards')) {
            const key = 'receiving_yards';
            props[key][playerName].over = market.options.find(o => o.api_side_id === 'over') || props[key][playerName].over;
            props[key][playerName].under = market.options.find(o => o.api_side_id === 'under') || props[key][playerName].under;
        }

        // Touchdowns
        if (marketNameLower.includes('any touchdowns')) {
            props.touchdowns[playerName].anytime.yes = market.options.find(o => o.api_side_id === 'yes') || props.touchdowns[playerName].anytime.yes;
            props.touchdowns[playerName].anytime.no = market.options.find(o => o.api_side_id === 'no') || props.touchdowns[playerName].anytime.no;
        }
        if (marketNameLower.includes('first touchdown')) {
            props.touchdowns[playerName].first.yes = market.options.find(o => o.api_side_id === 'yes') || props.touchdowns[playerName].first.yes;
            props.touchdowns[playerName].first.no = market.options.find(o => o.api_side_id === 'no') || props.touchdowns[playerName].first.no;
        }
    });
    return props;
};


const GameDetailPage: React.FC = () => {
    const { dbGameId } = useParams<{ dbGameId: string }>();
    const [game, setGame] = useState<GameDetails | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchGameDetails = async () => {
            if (!dbGameId) return;
            setLoading(true); setError(null);
            try {
                const { data, error: rpcError } = await supabase.rpc('get_game_details_v9', { p_game_id: parseInt(dbGameId) });
                if (rpcError) throw rpcError;
                if (!data) throw new Error("Game not found or failed to load.");
                setGame(data);
            } catch (e) {
                if (e instanceof Error) {
                    console.error('Error fetching game details:', e);
                    toast.error("Could not load game details.");
                    setError("Failed to load game details.");
                }
            } finally { setLoading(false); }
        };
        fetchGameDetails();
    }, [dbGameId]);

    const structuredProps = useMemo(() => {
        if (!game || !game.bet_categories) return null;
        const allMarkets = game.bet_categories.flatMap(c => c.markets || []);
        return groupPlayerMarkets(allMarkets);
    }, [game]);

    const gameLineMarkets = useMemo(() => {
        if (!game || !game.bet_categories) return { spreadMarket: null, moneylineMarket: null, totalMarket: null, homePointsMarket: null, awayPointsMarket: null };

        const relevantCategories = ['Main', 'Total', 'Team Props', 'Game Lines', 'Winner'];
        const gameMarkets = game.bet_categories
            .filter(c => c && relevantCategories.includes(c.main_category))
            .flatMap(c => c.markets || []);

        return {
            spreadMarket: gameMarkets.find(m => m?.market_name === 'Point Spread'),
            moneylineMarket: gameMarkets.find(m => m?.market_name === 'Winner' || m?.market_name === 'Moneyline'),
            totalMarket: gameMarkets.find(m => m?.market_name === 'Total Points'),
            homePointsMarket: gameMarkets.find(m => m?.market_name === `${game.home_team} Points`),
            awayPointsMarket: gameMarkets.find(m => m?.market_name === `${game.away_team} Points`),
        }
    }, [game]);


    if (loading) return <div className="flex justify-center items-center p-8"><ArrowPathIcon className="h-8 w-8 animate-spin text-sleeper-primary" /></div>;
    if (error) return <div className="p-6 bg-sleeper-surface-100 rounded-xl text-center border border-sleeper-error/50"><ExclamationTriangleIcon className="h-10 w-10 mx-auto text-sleeper-error mb-3" /><h3 className="text-lg font-semibold text-sleeper-text-primary">Error Loading Game</h3><p className="text-sleeper-text-secondary">{error}</p></div>;
    if (!game) return <div className="p-6 bg-sleeper-surface-100 rounded-xl text-center border border-sleeper-border"><h3 className="text-lg font-semibold text-sleeper-text-primary">Game Not Found</h3><p className="text-sleeper-text-secondary">The requested game could not be found.</p></div>;

    const formatSpreadLine = (line: number | null | undefined) => line ? (line > 0 ? `+${line}` : `${line}`) : '';

    const TABS_ORDER = ['Game', 'Passing', 'Rushing', 'Receiving', 'Touchdowns'];

    return (
        <div className="space-y-6">
            <Link to="/" className="inline-flex items-center text-sm font-medium text-sleeper-text-secondary hover:text-sleeper-primary transition-colors">
                <ArrowLeftIcon className="h-4 w-4 mr-2" />
                Back to All Games
            </Link>
            <div className="text-center bg-sleeper-surface-100 p-4 rounded-lg shadow-md border border-sleeper-border">
                <h1 className="text-xl sm:text-2xl font-bold text-sleeper-text-primary">{game.away_team} @ {game.home_team}</h1>
                <p className="text-sm text-sleeper-text-secondary mt-1">{new Date(game.game_time).toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' })}</p>
            </div>

            <Tab.Group>
                <div className="relative">
                    <div className="overflow-x-auto custom-scrollbar pb-2">
                        <Tab.List className="flex space-x-1 sm:space-x-2 rounded-xl bg-sleeper-surface p-1 min-w-max">
                            {TABS_ORDER.map(tabName => (
                                <Tab key={tabName} as={Fragment}>
                                    {({ selected }) => (
                                        <button className={`w-full px-3 sm:px-4 rounded-lg py-2.5 text-sm font-medium leading-5 transition-colors duration-200 focus:outline-none focus-visible:ring-2 ring-offset-2 ring-offset-sleeper-bg ring-white/60 ${selected ? 'bg-sleeper-primary text-white shadow' : 'text-sleeper-text-secondary hover:bg-sleeper-surface-200 hover:text-sleeper-text-primary'}`}>
                                            {tabName}
                                        </button>
                                    )}
                                </Tab>
                            ))}
                        </Tab.List>
                    </div>
                </div>
                <Tab.Panels className="mt-2">
                    <Tab.Panel className="rounded-xl bg-sleeper-surface-100 p-2 sm:p-3 space-y-2">
                        <div className="grid grid-cols-[1fr_repeat(3,minmax(80px,1fr))] gap-x-2 sm:gap-x-3 text-xs uppercase font-bold text-sleeper-text-secondary text-center mb-1">
                            <div className="text-left">Team</div>
                            <div>Points</div>
                            <div>Spread</div>
                            <div>Winner</div>
                        </div>
                        {[
                            { name: game.home_team, side: 'home', pointsMarket: gameLineMarkets.homePointsMarket },
                            { name: game.away_team, side: 'away', pointsMarket: gameLineMarkets.awayPointsMarket }
                        ].map(team => (
                            <div key={team.name} className="grid grid-cols-[1fr_repeat(3,minmax(80px,1fr))] gap-x-2 sm:gap-x-3 items-center bg-sleeper-surface-200 p-2 rounded-md min-h-[56px]">
                                <p className="font-bold text-sleeper-text-primary text-sm sm:text-base">{team.name}</p>
                                <div className="grid grid-cols-2 gap-1">
                                    <OddButton game={game} option={team.pointsMarket?.options.find(o => o.api_side_id === 'over')} marketName={`${team.name} Points`} lineLabel={`O ${team.pointsMarket?.options.find(o => o.api_side_id === 'over')?.line || ''}`} />
                                    <OddButton game={game} option={team.pointsMarket?.options.find(o => o.api_side_id === 'under')} marketName={`${team.name} Points`} lineLabel={`U ${team.pointsMarket?.options.find(o => o.api_side_id === 'under')?.line || ''}`} />
                                </div>
                                <OddButton game={game} option={gameLineMarkets.spreadMarket?.options.find(o => o.api_side_id === team.side)} marketName="Point Spread" lineLabel={formatSpreadLine(gameLineMarkets.spreadMarket?.options.find(o => o.api_side_id === team.side)?.line)} />
                                <OddButton game={game} option={gameLineMarkets.moneylineMarket?.options.find(o => o.api_side_id === team.side)} marketName="Moneyline" lineLabel={gameLineMarkets.moneylineMarket?.options.find(o => o.api_side_id === team.side)?.display_name || ' '} />
                            </div>
                        ))}
                        <div className="grid grid-cols-[1fr_repeat(3,minmax(80px,1fr))] gap-x-2 sm:gap-x-3 items-center bg-sleeper-surface-200 p-2 rounded-md min-h-[56px]">
                            <p className="font-bold text-sleeper-text-primary text-sm sm:text-base">Game Total</p>
                            <div className="grid grid-cols-2 col-span-1 gap-x-2">
                                <OddButton game={game} option={gameLineMarkets.totalMarket?.options.find(o => o.api_side_id === 'over')} marketName="Total Points" lineLabel={`O ${gameLineMarkets.totalMarket?.options.find(o => o.api_side_id === 'over')?.line || ''}`} />
                                <OddButton game={game} option={gameLineMarkets.totalMarket?.options.find(o => o.api_side_id === 'under')} marketName="Total Points" lineLabel={`U ${gameLineMarkets.totalMarket?.options.find(o => o.api_side_id === 'under')?.line || ''}`} />
                            </div>
                            <div className="col-span-2"></div>
                        </div>
                    </Tab.Panel>

                    <Tab.Panel key="Passing" className="rounded-xl bg-sleeper-surface-100 p-2 sm:p-3 space-y-px">
                        <div className="grid grid-cols-[1fr_repeat(2,minmax(90px,1fr))] gap-x-2 sm:gap-x-3 text-xs uppercase font-bold text-sleeper-text-secondary text-center p-2">
                            <div className="text-left">Player</div>
                            <div>Over</div>
                            <div>Under</div>
                        </div>
                        {structuredProps && Object.entries(structuredProps.passing_yards)
                            .filter(([, props]) => props.over || props.under)
                            .map(([playerName, props]) => (
                                <div key={playerName} className="grid grid-cols-[1fr_repeat(2,minmax(90px,1fr))] gap-x-2 sm:gap-x-3 items-center bg-sleeper-surface-200 p-2 rounded-md min-h-[56px]">
                                    <p className="font-bold text-sleeper-text-primary text-sm sm:text-base break-words">{playerName}</p>
                                    <OddButton game={game} option={props.over || undefined} marketName="passing_yards" playerName={playerName} lineLabel={props.over?.display_name || '-'} />
                                    <OddButton game={game} option={props.under || undefined} marketName="passing_yards" playerName={playerName} lineLabel={props.under?.display_name || '-'} />
                                </div>
                            ))}
                    </Tab.Panel>

                    <Tab.Panel key="Rushing" className="rounded-xl bg-sleeper-surface-100 p-2 sm:p-3 space-y-px">
                        <div className="grid grid-cols-[1fr_repeat(2,minmax(90px,1fr))] gap-x-2 sm:gap-x-3 text-xs uppercase font-bold text-sleeper-text-secondary text-center p-2">
                            <div className="text-left">Player</div>
                            <div>Over</div>
                            <div>Under</div>
                        </div>
                        {structuredProps && Object.entries(structuredProps.rushing_yards)
                            .filter(([, props]) => props.over || props.under)
                            .map(([playerName, props]) => (
                                <div key={playerName} className="grid grid-cols-[1fr_repeat(2,minmax(90px,1fr))] gap-x-2 sm:gap-x-3 items-center bg-sleeper-surface-200 p-2 rounded-md min-h-[56px]">
                                    <p className="font-bold text-sleeper-text-primary text-sm sm:text-base break-words">{playerName}</p>
                                    <OddButton game={game} option={props.over || undefined} marketName="rushing_yards" playerName={playerName} lineLabel={props.over?.display_name || '-'} />
                                    <OddButton game={game} option={props.under || undefined} marketName="rushing_yards" playerName={playerName} lineLabel={props.under?.display_name || '-'} />
                                </div>
                            ))}
                    </Tab.Panel>

                    <Tab.Panel key="Receiving" className="rounded-xl bg-sleeper-surface-100 p-2 sm:p-3 space-y-px">
                        <div className="grid grid-cols-[1fr_repeat(2,minmax(90px,1fr))] gap-x-2 sm:gap-x-3 text-xs uppercase font-bold text-sleeper-text-secondary text-center p-2">
                            <div className="text-left">Player</div>
                            <div>Over</div>
                            <div>Under</div>
                        </div>
                        {structuredProps && Object.entries(structuredProps.receiving_yards)
                            .filter(([, props]) => props.over || props.under)
                            .map(([playerName, props]) => (
                                <div key={playerName} className="grid grid-cols-[1fr_repeat(2,minmax(90px,1fr))] gap-x-2 sm:gap-x-3 items-center bg-sleeper-surface-200 p-2 rounded-md min-h-[56px]">
                                    <p className="font-bold text-sleeper-text-primary text-sm sm:text-base break-words">{playerName}</p>
                                    <OddButton game={game} option={props.over || undefined} marketName="receiving_yards" playerName={playerName} lineLabel={props.over?.display_name || '-'} />
                                    <OddButton game={game} option={props.under || undefined} marketName="receiving_yards" playerName={playerName} lineLabel={props.under?.display_name || '-'} />
                                </div>
                            ))}
                    </Tab.Panel>

                    <Tab.Panel key="Touchdowns" className="rounded-xl bg-sleeper-surface-100 p-2 sm:p-3 space-y-px">
                        <div className="grid grid-cols-[1fr_repeat(2,1fr)] gap-x-2 sm:gap-x-3 text-xs uppercase font-bold text-sleeper-text-secondary text-center p-2">
                            <div className="text-left">Player</div>
                            <div>Anytime</div>
                            <div>First</div>
                        </div>
                        {structuredProps && Object.entries(structuredProps.touchdowns)
                            .filter(([, props]) => props.anytime.yes || props.anytime.no || props.first.yes || props.first.no)
                            .sort(([, propsA], [, propsB]) => {
                                const oddsA = propsA.anytime.yes?.odds ?? 999;
                                const oddsB = propsB.anytime.yes?.odds ?? 999;
                                return oddsA - oddsB;
                            })
                            .map(([playerName, props]) => (
                                <div key={playerName} className="grid grid-cols-[1fr_repeat(2,1fr)] gap-x-2 sm:gap-x-3 items-center bg-sleeper-surface-200 p-2 rounded-md min-h-[56px]">
                                    <p className="font-bold text-sleeper-text-primary text-sm sm:text-base break-words">{playerName}</p>
                                    <div className="grid grid-cols-2 gap-1">
                                        <OddButton game={game} option={props.anytime.yes || undefined} marketName="Anytime Touchdown Scorer" playerName={playerName} lineLabel="Yes" />
                                        <OddButton game={game} option={props.anytime.no || undefined} marketName="Anytime Touchdown Scorer" playerName={playerName} lineLabel="No" />
                                    </div>
                                    <div className="grid grid-cols-2 gap-1">
                                        <OddButton game={game} option={props.first.yes || undefined} marketName="First Touchdown Scorer" playerName={playerName} lineLabel="Yes" />
                                        <OddButton game={game} option={props.first.no || undefined} marketName="First Touchdown Scorer" playerName={playerName} lineLabel="No" />
                                    </div>
                                </div>
                            ))}
                    </Tab.Panel>
                </Tab.Panels>
            </Tab.Group>
        </div>
    );
};

export default GameDetailPage;