// frontend/src/layouts/DashboardLayout.tsx
import React, { useState, useCallback, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { toast } from 'react-toastify';
import { useAuthContext } from '../App';

import BetSlip, { type SelectedBetDisplayInfo, type BetPlacementSelection } from '../components/BetSlip';
import { type AvailableBetDetail } from '../components/GameDetailPage';
import { type GameListSummaryBet } from '../components/GameList';
import { americanToDecimal } from '../utils/oddsConverter';

export interface DashboardContextType {
    addToBetSlip: (odd: AvailableBetDetail | GameListSummaryBet, isQuickBet?: boolean) => void; // isQuickBet can be kept for other potential uses
    removeFromBetSlip: (oddId: number) => void;
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

    const fetchProfileData = useCallback(async (isMounted: boolean) => { /* ... same ... */
        if (!session?.user) { if (isMounted) { setLoadingProfile(false); setFantasyBalance(null); setUsername(null); } return; }
        if(isMounted) setLoadingProfile(true);
        try {
            const { data: profileData, error } = await supabase.from('profiles').select('fantasy_balance, username').eq('id', session.user.id).single();
            if (!isMounted) return;
            if (error) {
                if (error.code === 'PGRST116') { toast.info("Welcome! Set username in Profile."); const dU = session.user.email?.split('@')[0] || 'NewUser'; setFantasyBalance(1000); setUsername(dU); if (!editingUsername) setNewUsernameInput(dU); }
                else { console.error('FETCH_PROFILE (DBLayout): Err:', error.message); toast.error("Profile summary load fail.");}
            } else if (profileData) { setFantasyBalance(profileData.fantasy_balance); const cU = profileData.username || session.user.email?.split('@')[0] || 'User'; setUsername(cU); if (!editingUsername) setNewUsernameInput(cU); }
        } catch (e: any) { if (!isMounted) return; console.error('FETCH_PROFILE (DBLayout): Exc:', e.message); toast.error("Profile summary load error.");
        } finally { if(isMounted) setLoadingProfile(false); }
    }, [session, editingUsername]);

    useEffect(() => { /* ... same ... */
        let isMounted = true; fetchProfileData(isMounted);
        let profileSub: any = null;
        if (session?.user) {
            profileSub = supabase.channel(`db-layout-profiles-${session.user.id}`)
                .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${session.user.id}` }, (payload) => {
                    if (!isMounted) return; const newP = payload.new as {fantasy_balance?:number,username?:string};
                    if (newP) { if(typeof newP.fantasy_balance==='number')setFantasyBalance(newP.fantasy_balance); if(typeof newP.username==='string'){setUsername(newP.username);if(!editingUsername)setNewUsernameInput(newP.username);}}
                }).subscribe((s, err) => { if(s==='SUBSCRIBED')console.log('DBLayout: Sub to profile.'); if(err)console.error('DBLayout: Profile sub err',err);});
        }
        return () => { isMounted = false; if (profileSub) supabase.removeChannel(profileSub).catch(console.error); };
    }, [session, fetchProfileData]);

    const handleUpdateUsernameSubmit = async (event: React.FormEvent<HTMLFormElement>) => { /* ... same ... */
        event.preventDefault(); const trimUser = newUsernameInput.trim(); if (!trimUser || !session?.user) { toast.warn("Username empty."); return; } if (trimUser === username) { setEditingUsername(false); toast.info("Username same."); return; } const wasPlacing = isPlacingBet; setIsPlacingBet(true); try { const { error } = await supabase.from('profiles').update({ username: trimUser, updated_at: new Date().toISOString() }).eq('id', session.user.id); if (error) toast.error(`Username update fail: ${error.message}`); else { toast.success("Username updated!"); setUsername(trimUser); setEditingUsername(false); }} catch (e: any) { toast.error(`Username update exc: ${e.message}`); } finally { setIsPlacingBet(wasPlacing); }
    };

    const addToBetSlipHandler = useCallback((oddSelection: AvailableBetDetail | GameListSummaryBet, _isQuickBet_param_not_used_for_stake?: boolean) => {
        // _isQuickBet_param_not_used_for_stake is kept in signature for compatibility with GameList call, but not directly used for stake logic here.
        console.log('DashboardLayout: addToBetSlipHandler called for odd ID:', oddSelection.id);
        let betTypeNameFromOdd = 'Market';
        if (oddSelection.bet_types?.name && oddSelection.bet_types.name.trim() !== '') betTypeNameFromOdd = oddSelection.bet_types.name;
        else console.warn('DBLayout: bet_types.name missing for odd:', oddSelection.id);

        const betToAdd: SelectedBetDisplayInfo = {
            id: oddSelection.id, selection_name: oddSelection.selection_name, odds: oddSelection.odds, line: oddSelection.line,
            bet_type_name: betTypeNameFromOdd,
            home_team: (oddSelection as AvailableBetDetail).game_info_for_slip?.home_team || (oddSelection as GameListSummaryBet).game_info_for_slip?.home_team,
            away_team: (oddSelection as AvailableBetDetail).game_info_for_slip?.away_team || (oddSelection as GameListSummaryBet).game_info_for_slip?.away_team,
        };

        let slipWasEmptyBeforeThisAdd = false;

        setSelectedBetsForSlip(prevSlip => {
            if (prevSlip.find(b => b.id === betToAdd.id)) { return prevSlip; } // Already handled by toggle logic, no toast
            if (prevSlip.length >= 10) { toast.warn("Maximum 10 selections."); return prevSlip; }
            slipWasEmptyBeforeThisAdd = prevSlip.length === 0;
            const decimalOddForToast = americanToDecimal(betToAdd.odds);
            toast.success(`${betToAdd.selection_name} (${decimalOddForToast.toFixed(2)}) added to slip!`);
            return [...prevSlip, betToAdd];
        });

        // If the slip was empty before this add operation, set the default stake.
        // This applies whether the bet came from GameList (isQuickBet=true) or GameDetailPage (isQuickBet=false)
        // as long as it's the first item being added to an empty slip.
        // Need to check stake as well to not override if user typed something already.
        if (slipWasEmptyBeforeThisAdd && (!stake || parseFloat(stake) === 0)) {
            setStake(DEFAULT_QUICK_BET_STAKE);
        }
    }, [DEFAULT_QUICK_BET_STAKE, stake, setStake]); // stake and setStake are dependencies now

    const handleRemoveBetFromSlip = useCallback((availableBetIdToRemove: number) => {
        let removedSelectionName = "Selection";
        setSelectedBetsForSlip(prev => {
            const betToRemove = prev.find(b => b.id === availableBetIdToRemove);
            if(betToRemove) removedSelectionName = betToRemove.selection_name;
            const newSlip = prev.filter(b => b.id !== availableBetIdToRemove);
            if (newSlip.length === 0) setStake(''); // Clear stake if slip becomes empty
            return newSlip;
        });
        toast.info(`${removedSelectionName} removed from slip.`);
    }, [setStake]); // Added setStake as a dependency

    const handleClearSlip = () => { setSelectedBetsForSlip([]); setStake(''); };
    const handlePlaceBetSubmit = async (stakeToPlace:number, selectionsToSubmit:BetPlacementSelection[], betSubmitType:'single'|'parlay') => { /* ... same ... */
        if (!session?.user) { toast.error("Not logged in."); return; } if (selectionsToSubmit.length === 0) { toast.warn("Slip empty."); return; } if (stakeToPlace <= 0) { toast.warn("Invalid stake."); return; } setIsPlacingBet(true); try { const { data, error: funcErr } = await supabase.functions.invoke('place-bet', { body: { selections: selectionsToSubmit, stake_amount: stakeToPlace, bet_type: betSubmitType }}); if (funcErr) { toast.error(`Bet fail: ${funcErr.message}`); console.error('Place-bet func err:', funcErr); } else if (data?.error) { toast.error(`Bet err: ${data.error}`); console.error('Place-bet app err:', data.error_details || data.error); } else if (data?.success) { toast.success(data.message || 'Bet placed!'); handleClearSlip(); fetchProfileData(true); } else { toast.error('Bet status unknown.'); console.warn('Place-bet unknown resp:', data); }} catch (e: any) { toast.error(`Unexpected err: ${e.message}`); console.error('Place-bet general exc:', e); } finally { setIsPlacingBet(false); }
    };

    const dashboardContextValue: DashboardContextType = {
        addToBetSlip: addToBetSlipHandler,
        removeFromBetSlip: handleRemoveBetFromSlip,
        isOddInBetSlip: (oddId: number) => selectedBetsForSlip.some(b => b.id === oddId),
    };

    return ( /* ... JSX remains the same ... */
        <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8"><div className="md:col-span-2 p-4 sm:p-6 bg-sleeper-surface-100 rounded-xl shadow-lg border border-sleeper-border"><div className="flex justify-between items-start"><div><p className="mb-1 text-md sm:text-lg text-sleeper-text-primary">Welcome, <span className="font-semibold text-sleeper-primary">{loadingProfile ? '...' : (username || session?.user?.email)}</span>!</p></div>
                {!editingUsername && (<button onClick={() => { setNewUsernameInput(username || session?.user?.email?.split('@')[0] || ''); setEditingUsername(true); }} className="text-xs text-sleeper-primary hover:opacity-80 underline flex-shrink-0 ml-4" title="Edit username">Edit Username</button>)}</div>
                {editingUsername && (<form onSubmit={handleUpdateUsernameSubmit} className="mt-2 space-y-2 sm:flex sm:items-end sm:gap-2"><div className="flex-grow"><label htmlFor="edit-uname-db" className="sr-only">Edit Username</label><input id="edit-uname-db" type="text" value={newUsernameInput} onChange={(e) => setNewUsernameInput(e.target.value)} className="w-full px-3 py-1.5 text-sm bg-sleeper-bg text-sleeper-text-primary border-sleeper-border rounded-md focus:outline-none ring-offset-sleeper-surface-100 focus:ring-2 focus:ring-sleeper-primary" placeholder="New username" disabled={isPlacingBet && editingUsername}/></div><div className="flex gap-2 mt-2 sm:mt-0 flex-shrink-0"><button type="submit" className="px-3 py-1.5 text-xs bg-sleeper-accent hover:bg-sleeper-accent-hover rounded-md text-sleeper-text-on-accent font-semibold disabled:opacity-50" disabled={(isPlacingBet && editingUsername) || !newUsernameInput.trim() || newUsernameInput.trim() === username}>{isPlacingBet && editingUsername ? 'Saving...' : 'Save'}</button><button type="button" onClick={() => { setEditingUsername(false); setNewUsernameInput(username || ''); }} className="px-3 py-1.5 text-xs bg-sleeper-surface-200 hover:bg-sleeper-border rounded-md text-sleeper-text-secondary font-semibold" disabled={isPlacingBet && editingUsername}>Cancel</button></div></form>)}
            </div><div className="p-4 sm:p-6 bg-sleeper-surface-100 rounded-xl shadow-lg border border-sleeper-border"><h2 className="text-md sm:text-lg font-semibold mb-1 sm:mb-2 text-sleeper-text-secondary">Balance:</h2>{loadingProfile ? <p className="text-2xl sm:text-3xl font-bold text-gray-500">Loading...</p> : fantasyBalance !== null ? <p className="text-2xl sm:text-3xl font-bold text-sleeper-success">${fantasyBalance.toFixed(2)}</p> : <p className="text-2xl sm:text-3xl font-bold text-sleeper-error">N/A</p>}</div></div>
            <div className="lg:flex lg:space-x-6"><div className="lg:w-2/3 mb-6 lg:mb-0"><Outlet context={dashboardContextValue satisfies DashboardContextType} /></div><div className="lg:w-1/3"><div className="sticky top-20"><BetSlip selectedBets={selectedBetsForSlip} onRemoveBet={handleRemoveBetFromSlip} onClearSlip={handleClearSlip} onPlaceBet={handlePlaceBetSubmit} isPlacingBet={isPlacingBet} stake={stake} onStakeChange={setStake} /></div></div></div>
        </>
    );
};
export default DashboardLayout;