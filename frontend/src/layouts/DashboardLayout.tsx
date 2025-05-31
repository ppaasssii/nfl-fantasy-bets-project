// frontend/src/layouts/DashboardLayout.tsx
import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { Outlet } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { toast } from 'react-toastify';
import { useAuthContext } from '../App'; // Stellt sicher, dass der Pfad zu App.tsx korrekt ist

import BetSlip, { type SelectedBetDisplayInfo, type BetPlacementSelection } from '../components/BetSlip';
// Importiere die Typen, die von GameList und GameDetailPage exportiert werden
import type { GameForListV2, QuickBetOption } from '../components/GameList';
import type { AvailableBetDetail as GameDetailAvailableBet } from '../components/GameDetailPage';

import { Dialog } from '@headlessui/react';
import { TicketIcon, XMarkIcon, UserCircleIcon, WalletIcon } from '@heroicons/react/24/outline';

export interface DashboardContextType {
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
    const [stake, setStake] = useState<string>('');
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

    const getBetTypeNameFromApiKey = (apiKey: string): string => { // Erwartet string
        if (apiKey === 'h2h') return 'WINNER';
        if (apiKey === 'spreads') return 'Spread';
        if (apiKey === 'totals') return 'Total';
        return 'Bet'; // Fallback
    };

    const handleAddOrUpdateBetInSlip = useCallback((
        newOdd: GameDetailAvailableBet | QuickBetOption,
        gameContext: GameForListV2
    ) => {
        const existingBetIndex = selectedBetsForSlip.findIndex(bet => bet.id === newOdd.id);
        let betToAdd: SelectedBetDisplayInfo;
        let betTypeName = "Unknown Bet Type";

        // Typsichere Ableitung von betTypeName
        const apiKey = newOdd.bet_type_api_key;

        if (apiKey && typeof apiKey === 'string') { // Sicherstellen, dass apiKey ein nicht-leerer String ist
            betTypeName = getBetTypeNameFromApiKey(apiKey);
        } else if ('bet_type_name' in newOdd && typeof newOdd.bet_type_name === 'string') {
            // Fallback, falls bet_type_api_key fehlt (sollte nicht passieren, wenn Typen korrekt sind)
            // und newOdd ist GameDetailAvailableBet (das hat bet_type_name)
            betTypeName = newOdd.bet_type_name;
        } else {
            console.warn("Could not determine bet_type_name from newOdd:", newOdd);
            betTypeName = "Bet"; // Generischer Fallback
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
        } else {
            setSelectedBetsForSlip(prev => [...prev, betToAdd]);
            toast.success(`"${betToAdd.selection_name}" added to slip!`, { autoClose: 2000 });
        }
    }, [selectedBetsForSlip]);

    const handleRemoveBetFromSlip = useCallback((idToRemove: number) => {
        setSelectedBetsForSlip(prev => prev.filter(bet => bet.id !== idToRemove));
        toast.info("Selection removed.", { autoClose: 1500 });
    }, []);

    const handleClearSlip = useCallback(() => {
        setSelectedBetsForSlip([]);
        setStake('');
        toast.info("Slip cleared.", { autoClose: 1500 });
    }, []);

    const handlePlaceBetSubmit = useCallback(async (
        currentStake: number,
        selectionsToPlace: BetPlacementSelection[],
        betTypeToPlace: 'single' | 'parlay'
    ) => {
        if (!session?.user || selectionsToPlace.length === 0 || currentStake <= 0) {
            toast.error("Invalid bet details."); return;
        }
        // Guthabenprüfung wurde in BetSlip.tsx verschoben, hier nur der Aufruf
        setIsPlacingBet(true);
        try {
            const { data, error } = await supabase.functions.invoke('place-bet', {
                body: { stake_amount: currentStake, selections: selectionsToPlace, bet_type: betTypeToPlace },
            });
            if (error) {
                console.error("Error placing bet (network/invoke):", error);
                toast.error(`Bet failed: ${error.message || 'Network error'}`);
            } else if (data?.error) {
                console.error("Error from place-bet function:", data.error);
                toast.error(`Bet failed: ${data.error}`);
            } else {
                toast.success(data.message || "Bet placed!");
                setSelectedBetsForSlip([]);
                setStake('');
                fetchProfileAndBalance();
                setIsBetSlipModalOpen(false);
            }
        } catch (e: any) {
            console.error("Unexpected error during bet placement:", e);
            toast.error("Unexpected error placing bet.");
        } finally {
            setIsPlacingBet(false);
        }
    }, [session, fetchProfileAndBalance]); // fantasyBalance hier nicht mehr zwingend als Abhängigkeit nötig, da Check in BetSlip

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
                            fantasyBalance={fantasyBalance} // Weiterhin für die Anzeige im BetSlip und die Button-Deaktivierung benötigt
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
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" aria-hidden="true" />
                <div className="fixed inset-0 flex items-center justify-center p-4">
                    <Dialog.Panel className="w-full max-w-lg rounded-xl bg-sleeper-surface-100 shadow-2xl border border-sleeper-border flex flex-col overflow-hidden" style={{maxHeight: '90vh'}}>
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
                                fantasyBalance={fantasyBalance} // Weiterhin für die Anzeige im BetSlip und die Button-Deaktivierung benötigt
                            />
                        </div>
                    </Dialog.Panel>
                </div>
            </Dialog>
        </>
    );
};
export default DashboardLayout;