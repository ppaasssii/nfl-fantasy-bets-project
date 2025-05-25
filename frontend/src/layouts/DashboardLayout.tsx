// frontend/src/layouts/DashboardLayout.tsx
import React, { useState, useCallback, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { toast } from 'react-toastify';
import { useAuthContext } from '../App';

import BetSlip, { type SelectedBetDisplayInfo, type BetPlacementSelection } from '../components/BetSlip';
import { type AvailableBetDetail } from '../components/GameDetailPage';
import { type GameListSummaryBet } from '../components/GameList';

export interface DashboardContextType {
    addToBetSlip: (odd: AvailableBetDetail | GameListSummaryBet, isQuickBet?: boolean) => void;
    isOddInBetSlip: (oddId: number) => boolean;
}

const DashboardLayout: React.FC = () => {
    const { session } = useAuthContext();

    const [loadingProfile, setLoadingProfile] = useState(true);
    const [fantasyBalance, setFantasyBalance] = useState<number | null>(null);
    const [username, setUsername] = useState<string | null>(null);
    const [editingUsername, setEditingUsername] = useState(false);
    const [newUsernameInput, setNewUsernameInput] = useState('');

    const [selectedBetsForSlip, setSelectedBetsForSlip] = useState<SelectedBetDisplayInfo[]>([]);
    const [isPlacingBet, setIsPlacingBet] = useState(false);
    const [stake, setStake] = useState<string>('');
    const DEFAULT_QUICK_BET_STAKE = "5.00";

    const fetchProfileData = useCallback(async (isMounted: boolean) => {
        if (!session?.user) {
            if (isMounted) { setLoadingProfile(false); setFantasyBalance(null); setUsername(null); }
            return;
        }
        if(isMounted) setLoadingProfile(true);
        try {
            const { data: profileData, error } = await supabase.from('profiles').select('fantasy_balance, username').eq('id', session.user.id).single();
            if (!isMounted) return;
            if (error) {
                if (error.code === 'PGRST116') {
                    toast.info("Welcome! Set a username in your Profile page.");
                    const defaultUsername = session.user.email?.split('@')[0] || 'NewUser';
                    setFantasyBalance(1000); setUsername(defaultUsername);
                    if (!editingUsername) setNewUsernameInput(defaultUsername);
                } else { console.error('FETCH_PROFILE (DashboardLayout): Error:', error.message); toast.error("Could not load profile summary.");}
            } else if (profileData) {
                setFantasyBalance(profileData.fantasy_balance);
                const currentUsername = profileData.username || session.user.email?.split('@')[0] || 'User';
                setUsername(currentUsername);
                if (!editingUsername) setNewUsernameInput(currentUsername);
            }
        } catch (e: any) { if (!isMounted) return; console.error('FETCH_PROFILE (DashboardLayout): Exception:', e.message); toast.error("Error loading profile summary.");
        } finally { if(isMounted) setLoadingProfile(false); }
    }, [session, editingUsername]);

    useEffect(() => {
        let isMounted = true; fetchProfileData(isMounted);
        let profileSubscription: any = null;
        if (session?.user) {
            profileSubscription = supabase.channel(`dashboard-layout-profiles-${session.user.id}`)
                .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${session.user.id}` },
                    (payload) => {
                        if (!isMounted) return;
                        const newProfileData = payload.new as { fantasy_balance?: number, username?: string };
                        if (newProfileData) {
                            if (typeof newProfileData.fantasy_balance === 'number') setFantasyBalance(newProfileData.fantasy_balance);
                            if (typeof newProfileData.username === 'string') { setUsername(newProfileData.username); if (!editingUsername) setNewUsernameInput(newProfileData.username); }
                        }
                    })
                .subscribe((status, err) => {
                    if (status === 'SUBSCRIBED') console.log('DashboardLayout: Subscribed to profile updates.');
                    if(err) console.error('DashboardLayout: Profile subscription error', err);
                });
        }
        return () => { isMounted = false; if (profileSubscription) supabase.removeChannel(profileSubscription).catch(console.error); };
    }, [session, fetchProfileData]);

    const handleUpdateUsernameSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const trimmedNewUsername = newUsernameInput.trim();
        if (!trimmedNewUsername || !session?.user) { toast.warn("Username cannot be empty."); return; }
        if (trimmedNewUsername === username) { setEditingUsername(false); toast.info("Username unchanged."); return; }
        const wasPlacingBet = isPlacingBet; setIsPlacingBet(true);
        try {
            const { error } = await supabase.from('profiles').update({ username: trimmedNewUsername, updated_at: new Date().toISOString() }).eq('id', session.user.id);
            if (error) { toast.error(`Failed to update username: ${error.message}`); }
            else { toast.success("Username updated!"); setUsername(trimmedNewUsername); setEditingUsername(false); }
        } catch (e: any) { toast.error(`Exception updating username: ${e.message}`); }
        finally { setIsPlacingBet(wasPlacingBet); }
    };

    const addToBetSlipHandler = useCallback((oddSelection: AvailableBetDetail | GameListSummaryBet, isQuickBet: boolean = false) => {
        const betToAdd: SelectedBetDisplayInfo = {
            id: oddSelection.id, selection_name: oddSelection.selection_name, odds: oddSelection.odds, line: oddSelection.line,
            bet_type_name: oddSelection.bet_types.name,
            home_team: (oddSelection as AvailableBetDetail).game_info_for_slip?.home_team || (oddSelection as GameListSummaryBet).game_info_for_slip?.home_team,
            away_team: (oddSelection as AvailableBetDetail).game_info_for_slip?.away_team || (oddSelection as GameListSummaryBet).game_info_for_slip?.away_team,
        };
        setSelectedBetsForSlip(prevSlip => {
            if (prevSlip.find(b => b.id === betToAdd.id)) { toast.warn("Selection already in slip."); return prevSlip; }
            if (prevSlip.length >= 10) { toast.warn("Maximum 10 selections in parlay."); return prevSlip; }
            toast.success(`${betToAdd.selection_name} (${betToAdd.odds.toFixed(2)}) added to slip!`);
            return [...prevSlip, betToAdd];
        });
        if (isQuickBet) setStake(DEFAULT_QUICK_BET_STAKE);
    }, [DEFAULT_QUICK_BET_STAKE]);

    const isOddInBetSlipHandler = (oddId: number): boolean => selectedBetsForSlip.some(b => b.id === oddId);
    const handleRemoveBetFromSlip = (id: number) => setSelectedBetsForSlip(p => p.filter(b => b.id !== id));
    const handleClearSlip = () => { setSelectedBetsForSlip([]); setStake(''); };

    const handlePlaceBetSubmit = async (stakeToPlace: number, selectionsToSubmit: BetPlacementSelection[], betSubmitType: 'single' | 'parlay') => {
        if (!session?.user) { toast.error("Not logged in."); return; }
        if (selectionsToSubmit.length === 0) { toast.warn("Slip is empty."); return; }
        if (stakeToPlace <= 0) { toast.warn("Invalid stake."); return; }
        setIsPlacingBet(true);
        try {
            const { data, error: funcErr } = await supabase.functions.invoke('place-bet', { body: { selections: selectionsToSubmit, stake_amount: stakeToPlace, bet_type: betSubmitType }});
            if (funcErr) { toast.error(`Bet failed: ${funcErr.message}`); console.error('Place-bet func error:', funcErr); }
            else if (data?.error) { toast.error(`Bet error: ${data.error}`); console.error('Place-bet app error:', data.error_details || data.error); }
            else if (data?.success) { toast.success(data.message || 'Bet placed!'); handleClearSlip(); fetchProfileData(true); }
            else { toast.error('Bet status unknown.'); console.warn('Place-bet unknown resp:', data); }
        } catch (e: any) { toast.error(`Unexpected error: ${e.message}`); console.error('Place-bet general exc:', e); }
        finally { setIsPlacingBet(false); }
    };

    const dashboardContextValue: DashboardContextType = { addToBetSlip: addToBetSlipHandler, isOddInBetSlip: isOddInBetSlipHandler };

    return (
        <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                <div className="md:col-span-2 p-4 sm:p-6 bg-sleeper-surface rounded-xl shadow-lg border border-sleeper-border">
                    <div className="flex justify-between items-start">
                        <div><p className="mb-1 text-md sm:text-lg text-sleeper-text-primary">Welcome, <span className="font-semibold text-sleeper-primary">{loadingProfile ? '...' : (username || session?.user?.email)}</span>!</p></div>
                        {!editingUsername && (<button onClick={() => { setNewUsernameInput(username || session?.user?.email?.split('@')[0] || ''); setEditingUsername(true); }} className="text-xs text-sleeper-primary hover:opacity-80 underline flex-shrink-0 ml-4" title="Edit display name">Edit Username</button>)}
                    </div>
                    {editingUsername && (
                        <form onSubmit={handleUpdateUsernameSubmit} className="mt-2 space-y-2 sm:flex sm:items-end sm:gap-2">
                            <div className="flex-grow"><label htmlFor="edit-username-dashboard" className="sr-only">Edit Username</label><input id="edit-username-dashboard" type="text" value={newUsernameInput} onChange={(e) => setNewUsernameInput(e.target.value)} className="w-full px-3 py-1.5 text-sm bg-sleeper-bg-secondary text-sleeper-text-primary border-sleeper-border rounded-md focus:outline-none focus:ring-2 focus:ring-sleeper-primary" placeholder="New username" disabled={isPlacingBet && editingUsername}/></div>
                            <div className="flex gap-2 mt-2 sm:mt-0 flex-shrink-0"><button type="submit" className="px-3 py-1.5 text-xs bg-sleeper-accent hover:bg-opacity-80 rounded-md text-white font-semibold disabled:opacity-50" disabled={(isPlacingBet && editingUsername) || !newUsernameInput.trim() || newUsernameInput.trim() === username}>{isPlacingBet && editingUsername ? 'Saving...' : 'Save'}</button><button type="button" onClick={() => { setEditingUsername(false); setNewUsernameInput(username || ''); }} className="px-3 py-1.5 text-xs bg-gray-600 hover:bg-gray-500 rounded-md text-white font-semibold" disabled={isPlacingBet && editingUsername}>Cancel</button></div>
                        </form>
                    )}
                </div>
                <div className="p-4 sm:p-6 bg-sleeper-surface rounded-xl shadow-lg border border-sleeper-border">
                    <h2 className="text-md sm:text-lg font-semibold mb-1 sm:mb-2 text-sleeper-text-secondary">Your Fantasy Balance:</h2>
                    {loadingProfile ? <p className="text-2xl sm:text-3xl font-bold text-gray-500">Loading...</p>
                        : fantasyBalance !== null ? <p className="text-2xl sm:text-3xl font-bold text-sleeper-success">${fantasyBalance.toFixed(2)}</p>
                            : <p className="text-2xl sm:text-3xl font-bold text-sleeper-error">N/A</p>}
                </div>
            </div>
            <div className="lg:flex lg:space-x-6">
                <div className="lg:w-2/3 mb-6 lg:mb-0">
                    <Outlet context={dashboardContextValue satisfies DashboardContextType} />
                </div>
                <div className="lg:w-1/3">
                    <div className="sticky top-20"> {/* Adjust top-X based on your header height */}
                        <BetSlip selectedBets={selectedBetsForSlip} onRemoveBet={handleRemoveBetFromSlip} onClearSlip={handleClearSlip} onPlaceBet={handlePlaceBetSubmit} isPlacingBet={isPlacingBet} stake={stake} onStakeChange={setStake} />
                    </div>
                </div>
            </div>
        </>
    );
};

export default DashboardLayout;