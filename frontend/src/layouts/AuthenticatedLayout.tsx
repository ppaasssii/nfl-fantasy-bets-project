// src/layouts/AuthenticatedLayout.tsx
import React, { useState, useCallback, useEffect } from 'react';
import { Outlet, useNavigate, useLocation, Link, NavLink } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { toast } from 'react-toastify';
import { ArrowLeftOnRectangleIcon, HomeIcon, ListBulletIcon, UserCircleIcon, TicketIcon, XMarkIcon, UserGroupIcon } from '@heroicons/react/24/outline';
import BottomNavigationBar from '../components/BottomNavigationBar';
import BetSlip from '../components/BetSlip';
import { type QuickBetOption, type BetSlipOdd, type BetPlacementSelection } from '../types';
import { type Session } from '@supabase/supabase-js';
import { type AppContextType } from '../App';

const generateBetSlipSelectionName = (
    odd: QuickBetOption,
    marketName: string,
    gameContext: { home_team: string; away_team: string; home_team_abbr: string; away_team_abbr: string; },
    playerName?: string
): string => {
    if (typeof marketName !== 'string') {
        return odd.display_name || 'Selection';
    }

    if (playerName) {
        const cleanMarketName = marketName.replace(/_/g, ' ').replace(/(?:^|\s)\S/g, a => a.toUpperCase());
        return `${playerName} - ${cleanMarketName} ${odd.display_name}`;
    }
    if (marketName.includes("Points")) {
        const team = marketName.replace(" Points", "");
        return `${team} Points ${odd.display_name}`;
    }
    switch (marketName) {
        case 'Moneyline':
            const teamName = odd.display_name.toLowerCase() === gameContext.home_team_abbr.toLowerCase()
                ? gameContext.home_team
                : gameContext.away_team;
            return `Winner: ${teamName}`;
        case 'Point Spread':
            return odd.display_name;
        default:
            return odd.display_name || marketName;
    }
};


const AuthenticatedLayout: React.FC<{
    session: Session;
    setSession: (session: Session | null) => void;
}> = ({ session, setSession }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const [loadingProfile, setLoadingProfile] = useState(true);
    const [fantasyBalance, setFantasyBalance] = useState<number | null>(null);
    const [selectedBets, setSelectedBets] = useState<BetSlipOdd[]>([]);
    const [isPlacingBet, setIsPlacingBet] = useState(false);
    const [stake, setStake] = useState<string>('2');
    const [isMobileBetSlipOpen, setIsMobileBetSlipOpen] = useState(false);

    const fetchProfile = useCallback(async () => {
        if (!session?.user) return;
        setLoadingProfile(true);
        const { data, error } = await supabase.from('profiles').select('fantasy_balance').eq('id', session.user.id).single();
        if (error && error.code !== 'PGRST116') { toast.error("Could not load user balance."); }
        else if (data) { setFantasyBalance(data.fantasy_balance); }
        setLoadingProfile(false);
    }, [session]);

    useEffect(() => {
        fetchProfile();
        const changes = supabase.channel(`profiles-balance-listener-${session.user.id}`)
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${session.user.id}` }, payload => {
                setFantasyBalance((payload.new as { fantasy_balance: number }).fantasy_balance);
            }).subscribe();
        return () => { supabase.removeChannel(changes).catch(console.error); };
    }, [fetchProfile, session.user.id]);

    const addToBetSlip = useCallback((
        odd: QuickBetOption,
        gameContext: { id: number; home_team: string; away_team: string; home_team_abbr: string; away_team_abbr: string; },
        marketName: string,
        playerName?: string,
    ) => {
        setSelectedBets(prev => {
            const isAlreadyInSlip = prev.some(b => b.id === odd.id);
            if (isAlreadyInSlip) {
                return prev.filter(b => b.id !== odd.id);
            }

            const selectionName = generateBetSlipSelectionName(odd, marketName, gameContext, playerName);

            const newBet: BetSlipOdd = {
                id: odd.id,
                selection_name: selectionName,
                odds_at_placement: odd.odds,
                line: odd.line ?? null,
                bet_type_name: marketName.replace(/_/g, ' '),
                game_info_for_slip: gameContext
            };

            // KORREKTUR: Die Logik zum automatischen Öffnen wurde entfernt.
            return [...prev, newBet];
        });
        if (selectedBets.length === 0) {
            setStake('2');
        }
    }, [selectedBets.length]);

    const removeFromBetSlip = useCallback((oddId: number) => { setSelectedBets(prev => prev.filter(b => b.id !== oddId)); }, []);
    const clearBetSlip = useCallback(() => {
        setSelectedBets([]);
        setStake('2');
        setIsMobileBetSlipOpen(false);
    }, []);
    const isOddInBetSlip = useCallback((oddId: number) => selectedBets.some(bet => bet.id === oddId), [selectedBets]);

    const placeBet = async (stakeAmount: number, selectionsToPlace: BetPlacementSelection[], betType: 'single' | 'parlay') => {
        setIsPlacingBet(true);
        try {
            const { error, data } = await supabase.functions.invoke('place-bet', { body: { selections: selectionsToPlace, stake_amount: stakeAmount, bet_type: betType } });
            const functionError = (data as any)?.error || error;
            if (functionError) { throw new Error(functionError.message || 'Bet placement failed.'); }
            toast.success('Bet placed successfully!');
            clearBetSlip();
            await fetchProfile();
        } catch (error: any) { toast.error(error.message);
        } finally { setIsPlacingBet(false); }
    };

    const handleLogout = async () => {
        await supabase.auth.signOut(); setSession(null); navigate('/login'); toast.success("Logged out successfully.");
    };

    const navigation = [
        { name: 'Games', href: '/', icon: HomeIcon, end: true },
        { name: 'History', href: '/history', icon: ListBulletIcon, end: false },
        { name: 'Leagues', href: '/leagues', icon: UserGroupIcon, end: false },
        { name: 'Profile', href: '/profile', icon: UserCircleIcon, end: false },
    ];

    const contextValue: AppContextType = {
        session, fantasyBalance, loadingProfile, selectedBets, stake, setStake,
        addToBetSlip,
        removeFromBetSlip, clearBetSlip, isOddInBetSlip, placeBet, isPlacingBet
    };

    const navLinkClasses = ({ isActive }: { isActive: boolean }) => `px-3 py-2 rounded-md text-sm font-medium transition-colors ${isActive ? 'bg-sleeper-primary text-white' : 'text-sleeper-text-secondary hover:bg-sleeper-surface hover:text-white'}`;

    return (
        <div className="min-h-screen bg-sleeper-bg flex flex-col font-sans">
            <header className="hidden sm:block bg-sleeper-surface-200 border-b border-sleeper-border sticky top-0 z-40">
                <div className="container mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex h-16 items-center justify-between">
                        <div className="flex items-center">
                            <Link to="/" className="text-white font-bold text-xl">FantasyBets</Link>
                            <nav className="ml-6 flex space-x-4">
                                {navigation.map((item) => (<NavLink key={item.name} to={item.href} className={navLinkClasses} end={item.end}>{item.name}</NavLink>))}
                            </nav>
                        </div>
                        <button onClick={handleLogout} className="flex items-center px-3 py-2 rounded-md text-sm font-medium text-sleeper-text-secondary hover:bg-sleeper-surface hover:text-white transition-colors">
                            <ArrowLeftOnRectangleIcon className="h-5 w-5 mr-1.5" /> Logout
                        </button>
                    </div>
                </div>
            </header>

            <main className="container mx-auto px-2 sm:px-6 lg:px-8 py-6 flex-grow pb-28 sm:pb-8">
                <Outlet context={contextValue} />
            </main>

            <div className="lg:hidden">
                {selectedBets.length > 0 && !isMobileBetSlipOpen && (
                    <div className="fixed bottom-16 sm:bottom-4 left-1/2 -translate-x-1/2 w-[95%] max-w-sm z-50">
                        <button onClick={() => setIsMobileBetSlipOpen(true)} className="w-full flex items-center justify-between bg-sleeper-accent hover:bg-sleeper-accent-hover text-white font-semibold px-4 py-3 rounded-xl shadow-lg transform transition-transform hover:scale-105">
                            <div className="flex items-center"><span className="bg-white text-sleeper-accent font-bold rounded-full h-6 w-6 flex items-center justify-center text-sm mr-3">{selectedBets.length}</span><span>View Bet Slip</span></div><TicketIcon className="h-6 w-6"/>
                        </button>
                    </div>
                )}
                {isMobileBetSlipOpen && (
                    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex justify-center items-center p-4" aria-modal="true" role="dialog" onClick={() => setIsMobileBetSlipOpen(false)}>
                        <div className="bg-sleeper-surface-100 rounded-2xl shadow-2xl w-full max-w-sm max-h-[85vh] flex flex-col border-2 border-sleeper-primary" onClick={e => e.stopPropagation()}>
                            <div className="flex-shrink-0 flex justify-between items-center p-4 border-b border-sleeper-border">
                                <h2 className="text-xl font-semibold text-sleeper-text-primary flex items-center"><TicketIcon className="h-6 w-6 mr-2 text-sleeper-primary" />Bet Slip</h2>
                                <button onClick={() => setIsMobileBetSlipOpen(false)} className="p-1 rounded-full text-sleeper-text-secondary hover:bg-sleeper-surface-200">
                                    <XMarkIcon className="h-6 w-6"/>
                                </button>
                            </div>
                            <div className="flex-grow overflow-y-auto custom-scrollbar p-4">
                                <BetSlip
                                    isInsideModal={true}
                                    selectedBets={selectedBets}
                                    onRemoveBet={removeFromBetSlip}
                                    onClearSlip={clearBetSlip}
                                    onPlaceBet={placeBet}
                                    isPlacingBet={isPlacingBet}
                                    stake={stake}
                                    onStakeChange={setStake}
                                    fantasyBalance={fantasyBalance}
                                />
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <BottomNavigationBar navigation={navigation} onLogout={handleLogout} />
        </div>
    );
};
export default AuthenticatedLayout;