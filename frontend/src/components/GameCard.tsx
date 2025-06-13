// src/components/GameCard.tsx
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { CalendarDaysIcon } from '@heroicons/react/24/outline';
import OddButton from './OddButton';
import { type GameDetails, type GameForListV2 } from '../types';

interface GameCardProps {
    gameId: number;
}

const GameCard: React.FC<GameCardProps> = ({ gameId }) => {
    const navigate = useNavigate();
    const [game, setGame] = useState<GameDetails | null>(null);

    useEffect(() => {
        const fetchGameData = async () => {
            const { data, error } = await supabase.rpc('get_game_details_v8', { p_game_id: gameId });
            if (error) {
                console.error(`Error fetching details for game ${gameId}:`, error);
            } else {
                setGame(data);
            }
        };
        fetchGameData();
    }, [gameId]);

    const handleCardClick = (e: React.MouseEvent) => {
        if ((e.target as HTMLElement).closest('button')) {
            e.stopPropagation();
            return;
        }
        navigate(`/game/${gameId}`);
    };

    if (!game) {
        return (
            <div className="bg-sleeper-surface rounded-lg shadow-md border border-sleeper-border/60 min-h-[160px] flex items-center justify-center">
                <div className="animate-pulse h-8 w-8 bg-sleeper-surface-200 rounded-full"></div>
            </div>
        );
    }

    const { home_team, away_team, home_team_abbr, away_team_abbr, bet_categories } = game;

    const gameMarkets = bet_categories?.find(c => c.main_category.startsWith('Game'))?.markets || [];
    const moneylineMarket = gameMarkets.find(m => m.market_name === 'Moneyline' || m.market_name === 'Winner');
    const spreadMarket = gameMarkets.find(m => m.market_name === 'Point Spread');
    const homePointsMarket = gameMarkets.find(m => m.market_name === `${home_team} Points`);
    const awayPointsMarket = gameMarkets.find(m => m.market_name === `${away_team} Points`);

    const teamsData = [
        { team: home_team, abbr: home_team_abbr, side: 'home', moneyline: moneylineMarket, spread: spreadMarket, pointsMarket: homePointsMarket },
        { team: away_team, abbr: away_team_abbr, side: 'away', moneyline: moneylineMarket, spread: spreadMarket, pointsMarket: awayPointsMarket }
    ];

    const formatSpreadLine = (line: number | null | undefined) => line ? (line > 0 ? `+${line}` : `${line}`) : '';
    const getMoneylineLabel = (option?: { display_name: string }) => option?.display_name || ' ';

    return (
        <div className="bg-sleeper-surface rounded-lg shadow-md border border-sleeper-border/60 overflow-hidden">
            <div onClick={handleCardClick} className="cursor-pointer px-3 py-2 border-b border-sleeper-border/30 flex justify-between items-center hover:bg-sleeper-primary/5">
                <div className="flex items-center space-x-2 text-xs">
                    <CalendarDaysIcon className="h-4 w-4 text-sleeper-text-secondary/80" />
                    <span className="font-semibold text-sleeper-text-primary">{new Date(game.game_time).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                    <span className="text-sleeper-text-secondary font-medium">- {new Date(game.game_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}</span>
                </div>
                <span className="text-xs text-sleeper-text-secondary hover:text-white pr-1">›</span>
            </div>

            <div className="p-3 cursor-pointer grid grid-cols-[1fr_repeat(3,minmax(80px,1fr))] gap-x-2 sm:gap-x-3" onClick={handleCardClick}>
                <div className="col-span-1"></div>
                <div className="text-center text-xs font-bold text-sleeper-text-secondary uppercase tracking-wider">Spread</div>
                <div className="text-center text-xs font-bold text-sleeper-text-secondary uppercase tracking-wider">Points</div>
                <div className="text-center text-xs font-bold text-sleeper-text-secondary uppercase tracking-wider">Winner</div>

                {teamsData.map((data) => (
                    <React.Fragment key={data.side}>
                        <div className="col-span-1 flex items-center min-h-[56px]">
                            <img src={`/nfl-logos/${data.abbr}.png`} className="h-6 w-6 mr-2 sm:mr-3 flex-shrink-0" alt={`${data.team} logo`} onError={(e) => e.currentTarget.style.display = 'none'} />
                            <p className="font-bold text-sleeper-text-primary text-sm sm:text-base">{data.team}</p>
                        </div>
                        <div className="flex items-center">
                            <OddButton game={game as any} option={data.spread?.options.find(o => o.api_side_id === data.side)} marketName="Point Spread" lineLabel={formatSpreadLine(data.spread?.options.find(o => o.api_side_id === data.side)?.line)} />
                        </div>
                        <div className="grid grid-cols-2 gap-1">
                            <OddButton game={game as any} option={data.pointsMarket?.options.find(o => o.api_side_id === 'over')} marketName={`${data.team} Points`} lineLabel={`O ${data.pointsMarket?.options.find(o => o.api_side_id === 'over')?.line || ''}`} />
                            <OddButton game={game as any} option={data.pointsMarket?.options.find(o => o.api_side_id === 'under')} marketName={`${data.team} Points`} lineLabel={`U ${data.pointsMarket?.options.find(o => o.api_side_id === 'under')?.line || ''}`} />
                        </div>
                        <div className="flex items-center">
                            <OddButton game={game as any} option={data.moneyline?.options.find(o => o.api_side_id === data.side)} marketName="Moneyline" lineLabel={getMoneylineLabel(data.moneyline?.options.find(o => o.api_side_id === data.side))} />
                        </div>
                    </React.Fragment>
                ))}
            </div>
        </div>
    );
};


const GameList: React.FC = () => {
    const [gameIds, setGameIds] = useState<number[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchGameIds = async () => {
            setLoading(true);
            const { data, error } = await supabase
                .from('games')
                .select('id')
                .gte('game_time', new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString()) // gte = greater than or equal
                .ilike('status', 'scheduled')
                .order('game_time', { ascending: true });

            if(error) {
                setError('Failed to load game list.');
                console.error(error);
            } else {
                setGameIds(data.map(g => g.id));
            }
            setLoading(false);
        };
        fetchGameIds();
    }, []);

    if (loading) return <div className="text-center p-8"><ArrowPathIcon className="h-8 w-8 animate-spin mx-auto text-sleeper-primary" /></div>;
    if (error) return <div className="text-center p-8 text-sleeper-error"><ExclamationTriangleIcon className="h-8 w-8 mx-auto mb-2" />{error}</div>;

    return (
        <div className="space-y-4">
            {gameIds.length > 0 ? (
                gameIds.map(id => <GameCard key={id} gameId={id} />)
            ) : (
                <div className="text-center py-16 bg-sleeper-surface rounded-lg shadow-inner border border-dashed border-sleeper-border">
                    <InboxIcon className="mx-auto h-16 w-16 text-sleeper-text-secondary opacity-40"/>
                    <h3 className="mt-4 text-lg font-medium text-sleeper-text-primary">No Upcoming Games</h3>
                    <p className="mt-1 text-sm text-sleeper-text-secondary">Please check back later for new game lines.</p>
                </div>
            )}
        </div>
    );
};

export default GameList;