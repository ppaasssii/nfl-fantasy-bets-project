// frontend/src/components/BetSlip.tsx
import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
// Attempting to import AvailableBetDetail - GameDetailPage.tsx MUST export this.
import { type AvailableBetDetail } from './GameDetailPage';

// This is the info the BetSlip itself primarily works with for display purposes.
// It can be constructed from either GameListSummaryBet or AvailableBetDetail.
export interface SelectedBetDisplayInfo {
    id: number; // This is the available_bet.id
    selection_name: string;
    odds: number;
    line: number | null;
    bet_type_name: string;
    // Optional: For displaying more context in the slip if needed
    home_team?: string;
    away_team?: string;
}

// This is what the onPlaceBet function (passed as prop from DashboardLayout) expects for its 'selections'
export interface BetPlacementSelection {
    available_bet_id: number;
    // odds_at_placement: number; // Backend should ideally re-verify odds, but can be passed
}

interface BetSlipProps {
    selectedBets: SelectedBetDisplayInfo[]; // Array of bets currently in the slip
    onRemoveBet: (availableBetIdToRemove: number) => void;
    onClearSlip: () => void;
    onPlaceBet: ( // This function is provided by DashboardLayout
        stake: number,
        selections: BetPlacementSelection[],
        betType: 'single' | 'parlay'
    ) => Promise<void>;
    isPlacingBet: boolean; // Controlled by DashboardLayout
    stake: string;         // Controlled by DashboardLayout
    onStakeChange: (newStake: string) => void; // Controlled by DashboardLayout
}

const BetSlip: React.FC<BetSlipProps> = ({
                                             selectedBets,
                                             onRemoveBet,
                                             onClearSlip,
                                             onPlaceBet,
                                             isPlacingBet,
                                             stake,
                                             onStakeChange,
                                         }) => {
    const [totalOdds, setTotalOdds] = useState<number>(1);
    const [potentialPayout, setPotentialPayout] = useState<number>(0);
    const [currentBetType, setCurrentBetType] = useState<'single' | 'parlay'>('single');

    useEffect(() => {
        if (selectedBets.length === 0) {
            setTotalOdds(1);
            setPotentialPayout(0);
            setCurrentBetType('single'); // Default to single if slip is empty
            // Stake is managed by parent, will be cleared via onClearSlip -> handleClearSlip in DashboardLayout
            return;
        }

        let calculatedOdds = 1;
        if (selectedBets.length === 1) {
            setCurrentBetType('single');
            calculatedOdds = selectedBets[0].odds;
        } else { // More than 1 selection implies a parlay
            setCurrentBetType('parlay');
            // Ensure all odds are numbers before reducing
            calculatedOdds = selectedBets.reduce((acc, bet) => {
                const oddValue = typeof bet.odds === 'number' && !isNaN(bet.odds) ? bet.odds : 1;
                return acc * oddValue;
            }, 1);
        }
        setTotalOdds(calculatedOdds);

        const numericStake = parseFloat(stake);
        if (numericStake > 0 && calculatedOdds > 0) { // Check calculatedOdds as well
            setPotentialPayout(numericStake * calculatedOdds);
        } else {
            setPotentialPayout(0);
        }
    }, [selectedBets, stake]);

    const handleStakeInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        // Allow empty string, or numbers with up to 2 decimal places
        if (/^\d*\.?\d{0,2}$/.test(value) || value === '') {
            onStakeChange(value); // Call parent's handler
        }
    };

    const handlePlaceBetClick = async () => {
        const numericStake = parseFloat(stake);
        if (selectedBets.length === 0) {
            toast.warn('Please add selections to your bet slip.');
            return;
        }
        if (!numericStake || numericStake <= 0) {
            toast.warn('Please enter a valid stake amount.');
            return;
        }
        // Prepare selections for the backend: just the available_bet_id
        const selectionsToPlace: BetPlacementSelection[] = selectedBets.map(b => ({
            available_bet_id: b.id,
        }));
        await onPlaceBet(numericStake, selectionsToPlace, currentBetType);
        // Clearing the slip and stake is now handled by DashboardLayout upon successful bet placement.
    };

    if (selectedBets.length === 0 && !isPlacingBet) {
        return (
            <div className="p-6 bg-sleeper-surface border border-sleeper-border rounded-xl shadow-xl text-center min-h-[200px] flex flex-col justify-center items-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="mx-auto h-12 w-12 text-sleeper-text-secondary opacity-60 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                </svg>
                <h3 className="text-lg font-semibold text-sleeper-primary mb-1">Bet Slip</h3>
                <p className="text-sm text-sleeper-text-secondary">Your bet slip is empty.</p>
                <p className="text-xs text-gray-500 mt-1">Click odds to add selections.</p>
            </div>
        );
    }

    return (
        <div className={`p-4 bg-sleeper-surface border border-sleeper-border rounded-xl shadow-xl space-y-4 min-h-[200px] ${isPlacingBet ? 'opacity-70 pointer-events-none' : ''}`}>
            <div className="flex justify-between items-center pb-2 border-b border-sleeper-border">
                <h3 className="text-lg font-semibold text-sleeper-primary">Bet Slip</h3>
                {selectedBets.length > 0 && (
                    <button
                        onClick={onClearSlip}
                        className="text-xs text-sleeper-error hover:opacity-80 font-medium disabled:opacity-50"
                        title="Clear all selections"
                        disabled={isPlacingBet}
                    >
                        Clear All
                    </button>
                )}
            </div>

            {selectedBets.length > 0 && (
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1 custom-scrollbar">
                    {selectedBets.map((bet) => (
                        <div key={bet.id} className="bg-sleeper-bg-secondary p-2.5 rounded-md text-xs flex justify-between items-center shadow-sm border border-sleeper-border">
                            <div>
                                <p className="font-medium text-sleeper-text-primary text-sm leading-tight">{bet.selection_name}</p>
                                <p className="text-sleeper-text-secondary text-xs leading-tight">{bet.bet_type_name}{bet.line ? ` (${bet.line > 0 ? `+${bet.line.toFixed(1)}` : bet.line.toFixed(1)})` : ''}</p>
                                <p className="text-indigo-400 font-semibold">Odds: {bet.odds.toFixed(2)}</p>
                            </div>
                            <button
                                onClick={() => onRemoveBet(bet.id)}
                                className="text-sleeper-error hover:opacity-80 text-xl font-bold px-2 py-0.5 rounded-full hover:bg-sleeper-border transition-colors"
                                title="Remove selection"
                                disabled={isPlacingBet}
                            >
                                ×
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {isPlacingBet && selectedBets.length === 0 && (
                <p className="text-center text-sleeper-text-secondary py-4">Processing your bet...</p>
            )}

            {selectedBets.length > 0 && (
                <>
                    <div className="pt-3 border-t border-sleeper-border">
                        <label htmlFor="stake-betslip" className="block text-sm font-medium text-sleeper-text-secondary mb-1">
                            Stake Amount ($)
                        </label>
                        <input
                            type="text"
                            id="stake-betslip"
                            value={stake}
                            onChange={handleStakeInputChange}
                            placeholder="0.00"
                            className="w-full px-3 py-2 bg-sleeper-bg-secondary text-sleeper-text-primary border-sleeper-border rounded-md focus:outline-none focus:ring-2 focus:ring-sleeper-primary shadow-inner"
                            disabled={isPlacingBet}
                        />
                    </div>

                    <div className="text-sm text-sleeper-text-secondary space-y-1.5 py-2 px-1">
                        <div className="flex justify-between">
                            <span>Type:</span>
                            <span className="font-semibold text-sleeper-text-primary">{currentBetType.charAt(0).toUpperCase() + currentBetType.slice(1)}</span>
                        </div>
                        <div className="flex justify-between">
                            <span>Selections:</span>
                            <span className="font-semibold text-sleeper-text-primary">{selectedBets.length}</span>
                        </div>
                        <div className="flex justify-between">
                            <span>Total Odds:</span>
                            <span className="font-semibold text-sleeper-text-primary">{totalOdds.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between items-center text-md mt-1 pt-2 border-t border-sleeper-border">
                            <span className="font-medium text-sleeper-text-primary">Potential Payout:</span>
                            <span className="font-bold text-sleeper-success">${potentialPayout.toFixed(2)}</span>
                        </div>
                    </div>

                    <button
                        onClick={handlePlaceBetClick}
                        disabled={isPlacingBet || !stake || parseFloat(stake) <= 0 || selectedBets.length === 0}
                        className="w-full bg-sleeper-accent hover:bg-opacity-80 text-white font-semibold py-2.5 px-4 rounded-md disabled:opacity-60 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-sleeper-accent focus:ring-offset-2 focus:ring-offset-sleeper-surface"
                    >
                        {isPlacingBet ?
                            ( <span className="flex items-center justify-center">
                                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                Placing Bet...
                              </span> )
                            : `Place ${currentBetType.charAt(0).toUpperCase() + currentBetType.slice(1)} Bet`
                        }
                    </button>
                </>
            )}
        </div>
    );
};

export default BetSlip;