// frontend/src/layouts/DashboardLayout.tsx
import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { Outlet } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { toast } from 'react-toastify';
import { useAuthContext } from '../App';

import BetSlip, { type SelectedBetDisplayInfo, type BetPlacementSelection } from '../components/BetSlip';
import type { GameForListV2, QuickBetOption } from '../components/GameList';
import type { AvailableBetDetail as GameDetailAvailableBet } from '../components/GameDetailPage';

import { Dialog } from '@headlessui/react';
import { TicketIcon, XMarkIcon, UserCircleIcon, WalletIcon } from '@heroicons/react/24/outline';

export interface DashboardContextType {
    // Die Signatur von addToBetSlip bleibt void, da wir die Logik in GameList.tsx anpassen
    addToBetSlip: (odd: GameDetailAvailableBet | QuickBetOption, gameContext: GameForListV2) => void;
    removeFromBetSlip: (oddId: number) => void;
    isOddInBetSlip: (oddId: number) => boolean;
    openBetSlipModal?: () => void;
}

const DashboardLayout: React.FC = () => {
    const { session } = useAuthContext();
    const [loadingProfile, setLoadingProfile] = useState(true);
    const [fantasyBalance, setFantasyBalance] = useState<number | null>(null);
    const [username, setUsername] = useState<string | null>(null);

    const [selectedBetsForSlip, setSelectedBetsForSlip] = useState<SelectedBetDisplayInfo[]>([]);
    const [isPlacingBet, setIsPlacingBet] = useState(false);
    const [stake, setStake] = useState<string>('2');
    const [isBetSlipModalOpen, setIsBetSlipModalOpen] = useState(false);

    const fetchProfileAndBalance = useCallback(async () => {
        if (!session?.user) { setLoadingProfile(false); return; }
        setLoadingProfile(true);
        try {
            const { data, error } = await supabase.from('profiles').select('username, fantasy_balance').eq('id', session.user.id).single();
            if (error) {
                toast.error(error.message || "Failed to fetch profile.");
                setUsername('Player');
                setFantasyBalance(0);
            } else if (data) {
                setUsername(data.username || 'Player');
                setFantasyBalance(data.fantasy_balance);
            }
        } catch (e: any) {
            toast.error("An unexpected error occurred while fetching profile.");
            setUsername('Player');
            setFantasyBalance(0);
        } finally {
            setLoadingProfile(false);
        }
    }, [session]);

    useEffect(() => { fetchProfileAndBalance(); }, [fetchProfileAndBalance]);

    const getBetTypeNameFromApiKey = (apiKey: string): string => {
        if (apiKey === 'h2h') return 'WINNER';
        if (apiKey === 'spreads') return 'Spread';
        if (apiKey === 'totals') return 'Total';
        return 'Bet';
    };

    const handleAddOrUpdateBetInSlip = useCallback((
        newOdd: GameDetailAvailableBet | QuickBetOption,
        gameContext: GameForListV2
    ) => {
        const existingBetIndex = selectedBetsForSlip.findIndex(bet => bet.id === newOdd.id);
        let betToAdd: SelectedBetDisplayInfo;
        let betTypeName = "Unknown Bet Type";
        const apiKey = newOdd.bet_type_api_key;

        if (apiKey && typeof apiKey === 'string') {
            betTypeName = getBetTypeNameFromApiKey(apiKey);
        } else if ('bet_type_name' in newOdd && typeof newOdd.bet_type_name === 'string') {
            betTypeName = newOdd.bet_type_name;
        } else {
            console.warn("Could not determine bet_type_name from newOdd:", newOdd);
            betTypeName = "Bet";
        }

        betToAdd = {
            id: newOdd.id,
            selection_name: newOdd.selection_name,
            odds: newOdd.odds,
            line: newOdd.line === undefined ? null : newOdd.line,
            bet_type_name: betTypeName,
            home_team: gameContext.home_team,
            away_team: gameContext.away_team,
        };

        if (existingBetIndex > -1) {
            setSelectedBetsForSlip(prev => prev.filter(bet => bet.id !== newOdd.id));
            toast.info(`"${betToAdd.selection_name}" removed from slip.`, { autoClose: 2000 });
            // Kein Rückgabewert mehr benötigt, da die Logik in GameList liegt
        } else {
            setSelectedBetsForSlip(prev => [...prev, betToAdd]);
            toast.success(`"${betToAdd.selection_name}" added to slip!`, { autoClose: 2000 });
            // Kein Rückgabewert mehr benötigt
        }
    }, [selectedBetsForSlip]);

    const handleRemoveBetFromSlip = useCallback((idToRemove: number) => {
        setSelectedBetsForSlip(prev => prev.filter(bet => bet.id !== idToRemove));
        toast.info("Selection removed.", { autoClose: 1500 });
    }, []);

    const handleClearSlip = useCallback(() => {
        setSelectedBetsForSlip([]);
        setStake('2');
        toast.info("Slip cleared.", { autoClose: 1500 });
    }, []);

    const handlePlaceBetSubmit = useCallback(async (
        totalStakeFromSlip: number,
        selectionsToPlace: BetPlacementSelection[],
        betTypeToPlace: 'single' | 'parlay'
    ) => {
        if (!session?.user || selectionsToPlace.length === 0 || totalStakeFromSlip <= 0) {
            toast.error("Invalid bet details. Check stake and selections.");
            return;
        }
        if (fantasyBalance !== null && totalStakeFromSlip > fantasyBalance) {
            toast.error("Total stake exceeds your available balance.");
            return;
        }
        setIsPlacingBet(true);
        if (betTypeToPlace === 'single' && selectionsToPlace.length > 0) {
            let allSucceeded = true;
            let successfulBetsCount = 0;
            const stakePerSingleBet = selectionsToPlace.length > 0 ? totalStakeFromSlip / selectionsToPlace.length : 0;
            if (stakePerSingleBet < 0.01 && selectionsToPlace.length > 0) {
                toast.error(`Stake per individual bet ($${stakePerSingleBet.toFixed(2)}) is too low.`);
                setIsPlacingBet(false);
                return;
            }
            for (const selection of selectionsToPlace) {
                try {
                    const { data, error } = await supabase.functions.invoke('place-bet', {
                        body: { stake_amount: stakePerSingleBet, selections: [selection], bet_type: 'single' },
                    });
                    if (error) { allSucceeded = false; console.error(`Error placing single bet for selection ${selection.available_bet_id}:`, error); toast.error(`Bet on selection failed: ${error.message || 'Network error'}`);
                    } else if (data?.error) { allSucceeded = false; console.error(`Error from place-bet function for selection ${selection.available_bet_id}:`, data.error); toast.error(`Bet on selection failed: ${data.error}`);
                    } else { successfulBetsCount++; }
                } catch (e: any) { allSucceeded = false; console.error(`Unexpected error during single bet placement for selection ${selection.available_bet_id}:`, e); toast.error("An unexpected error occurred placing a single bet."); }
            }
            if (allSucceeded && successfulBetsCount === selectionsToPlace.length) { toast.success(`${successfulBetsCount} single bet(s) placed successfully!`);
            } else if (successfulBetsCount > 0) { toast.warn(`${successfulBetsCount} out of ${selectionsToPlace.length} single bets placed. Some failed.`);
            } else { toast.error("All single bets failed to place."); }
            setSelectedBetsForSlip([]); setStake('2'); fetchProfileAndBalance(); setIsBetSlipModalOpen(false);
        } else if (betTypeToPlace === 'parlay') {
            try {
                const { data, error } = await supabase.functions.invoke('place-bet', {
                    body: { stake_amount: totalStakeFromSlip, selections: selectionsToPlace, bet_type: 'parlay' },
                });
                if (error) { throw error; }
                if (data?.error) { throw new Error(data.error); }
                toast.success(data.message || "Combi bet placed successfully!");
                setSelectedBetsForSlip([]); setStake('2'); fetchProfileAndBalance(); setIsBetSlipModalOpen(false);
            } catch (e: any) { console.error("Error placing combi bet:", e); toast.error(`Combi bet placement failed: ${e.message || 'Please try again.'}`); }
        }
        setIsPlacingBet(false);
    }, [session, fetchProfileAndBalance, fantasyBalance]);

    const dashboardContextValue = useMemo(() => ({
        addToBetSlip: handleAddOrUpdateBetInSlip,
        removeFromBetSlip: handleRemoveBetFromSlip,
        isOddInBetSlip: (oddId: number) => selectedBetsForSlip.some(b => b.id === oddId),
        openBetSlipModal: () => setIsBetSlipModalOpen(true),
    }), [selectedBetsForSlip, handleAddOrUpdateBetInSlip, handleRemoveBetFromSlip]);

    return (
        <>
            <div className="mb-6 grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                <div className="bg-sleeper-surface p-3 sm:p-4 rounded-xl shadow-lg border border-sleeper-border/70 flex items-center space-x-3">
                    <UserCircleIcon className="h-8 w-8 sm:h-10 sm:w-10 text-sleeper-primary" />
                    <div>
                        <h2 className="text-xs sm:text-sm font-medium text-sleeper-text-secondary">Welcome Back,</h2>
                        {loadingProfile ? <p className="text-lg sm:text-xl font-semibold text-gray-500">Loading...</p> :
                            <p className="text-lg sm:text-xl font-semibold text-sleeper-text-primary truncate">{username || 'Player'}</p>}
                    </div>
                </div>
                <div className="bg-sleeper-surface p-3 sm:p-4 rounded-xl shadow-lg border border-sleeper-border/70 flex items-center space-x-3">
                    <WalletIcon className="h-8 w-8 sm:h-10 sm:w-10 text-sleeper-accent" />
                    <div>
                        <h2 className="text-xs sm:text-sm font-medium text-sleeper-text-secondary">Balance:</h2>
                        {loadingProfile ? <p className="text-lg sm:text-xl font-bold text-gray-500">Loading...</p> :
                            fantasyBalance !== null ? <p className="text-lg sm:text-xl font-bold text-sleeper-success">${fantasyBalance.toFixed(2)}</p> :
                                <p className="text-lg sm:text-xl font-bold text-sleeper-error">N/A</p>}
                    </div>
                </div>
            </div>

            <div className="lg:flex lg:space-x-6">
                <div className="lg:w-2/3 mb-6 lg:mb-0">
                    <Outlet context={dashboardContextValue} />
                </div>
                <div className="hidden lg:block lg:w-1/3">
                    <div className="sticky top-20">
                        <BetSlip
                            selectedBets={selectedBetsForSlip}
                            onRemoveBet={handleRemoveBetFromSlip}
                            onClearSlip={handleClearSlip}
                            onPlaceBet={handlePlaceBetSubmit}
                            isPlacingBet={isPlacingBet}
                            stake={stake}
                            onStakeChange={setStake}
                            fantasyBalance={fantasyBalance}
                        />
                    </div>
                </div>
            </div>

            {selectedBetsForSlip.length > 0 && (
                <button
                    onClick={() => setIsBetSlipModalOpen(true)}
                    className="lg:hidden fixed bottom-20 right-4 bg-sleeper-accent text-white p-3 rounded-full shadow-xl hover:bg-sleeper-accent-hover transition-transform duration-150 ease-in-out active:scale-95 z-40 flex items-center"
                >
                    <TicketIcon className="h-6 w-6" />
                    <span className="ml-2 bg-sleeper-primary text-white text-xs font-semibold rounded-full h-5 min-w-[1.25rem] px-1 flex items-center justify-center">
                        {selectedBetsForSlip.length}
                    </span>
                </button>
            )}

            <Dialog open={isBetSlipModalOpen} onClose={() => setIsBetSlipModalOpen(false)} className="relative z-50 lg:hidden">
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" aria-hidden="true" />
                <div className="fixed inset-0 flex items-center justify-center p-4">
                    <Dialog.Panel className="w-full max-w-lg rounded-xl bg-sleeper-surface shadow-2xl border border-sleeper-border flex flex-col overflow-hidden" style={{maxHeight: '90vh'}}>
                        <div className="flex justify-between items-center p-4 border-b border-sleeper-border">
                            <Dialog.Title className="text-lg font-semibold text-sleeper-text-primary">Your Bet Slip</Dialog.Title>
                            <button onClick={() => setIsBetSlipModalOpen(false)} className="text-sleeper-text-secondary hover:text-sleeper-text-primary p-1 rounded-full hover:bg-sleeper-surface-200 transition-colors" aria-label="Close bet slip">
                                <XMarkIcon className="h-6 w-6" />
                            </button>
                        </div>
                        <div className="overflow-y-auto flex-grow">
                            <BetSlip
                                selectedBets={selectedBetsForSlip}
                                onRemoveBet={handleRemoveBetFromSlip}
                                onClearSlip={handleClearSlip}
                                onPlaceBet={handlePlaceBetSubmit}
                                isPlacingBet={isPlacingBet}
                                stake={stake}
                                onStakeChange={setStake}
                                isMobileView={true}
                                fantasyBalance={fantasyBalance}
                            />
                        </div>
                    </Dialog.Panel>
                </div>
            </Dialog>
        </>
    );
};
export default DashboardLayout;