// frontend/src/components/BetSlip.tsx
import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { americanToDecimal, calculatePotentialPayout } from '../utils/oddsConverter';
import { TrashIcon, TicketIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';

export interface SelectedBetDisplayInfo {
    id: number;
    selection_name: string;
    odds: number;
    line: number | null;
    bet_type_name: string;
    home_team?: string;
    away_team?: string;
}

export interface BetPlacementSelection { available_bet_id: number; }

interface BetSlipProps {
    selectedBets: SelectedBetDisplayInfo[];
    onRemoveBet: (id: number) => void;
    onClearSlip: () => void;
    onPlaceBet: (stake: number, selections: BetPlacementSelection[], betType: 'single' | 'parlay') => Promise<void>;
    isPlacingBet: boolean;
    stake: string;
    onStakeChange: (stake: string) => void;
    isMobileView?: boolean;
    fantasyBalance: number | null; // NEU: Prop für das Guthaben
}

const BetSlip: React.FC<BetSlipProps> = ({
                                             selectedBets,
                                             onRemoveBet,
                                             onClearSlip,
                                             onPlaceBet,
                                             isPlacingBet,
                                             stake,
                                             onStakeChange,
                                             isMobileView = false,
                                             fantasyBalance // NEU: Prop hier destrukturieren
                                         }) => {
    const [totalDecimalOdds, setTotalDecimalOdds] = useState<number>(1);
    const [potentialPayout, setPotentialPayout] = useState<number>(0);
    const [currentBetType, setCurrentBetType] = useState<'single' | 'parlay'>('single');

    useEffect(() => {
        if (selectedBets.length === 0) {
            setTotalDecimalOdds(1);
            setPotentialPayout(0);
            return;
        }

        if (selectedBets.length > 1 && currentBetType === 'single') {
            setCurrentBetType('parlay');
        } else if (selectedBets.length === 1 && currentBetType === 'parlay') {
            setCurrentBetType('single');
        }

        let combinedOdds = 1;
        if (currentBetType === 'parlay') {
            selectedBets.forEach(bet => {
                combinedOdds *= americanToDecimal(bet.odds);
            });
        } else if (currentBetType === 'single' && selectedBets.length > 0) {
            combinedOdds = americanToDecimal(selectedBets[0].odds);
        }
        setTotalDecimalOdds(combinedOdds);

    }, [selectedBets, currentBetType]);

    useEffect(() => {
        const stakeValue = parseFloat(stake);
        if (stakeValue > 0 && totalDecimalOdds > 1) {
            if (currentBetType === 'parlay') {
                setPotentialPayout(calculatePotentialPayout(stakeValue, totalDecimalOdds));
            } else if (currentBetType === 'single') {
                if (selectedBets.length > 0) {
                    setPotentialPayout(calculatePotentialPayout(stakeValue / selectedBets.length, americanToDecimal(selectedBets[0].odds)) * selectedBets.length);
                } else {
                    setPotentialPayout(0);
                }
            }
        } else {
            setPotentialPayout(parseFloat(stake) || 0);
        }
    }, [stake, totalDecimalOdds, selectedBets, currentBetType]);

    const handlePlaceBetClick = async () => {
        const stakeValue = parseFloat(stake);
        if (isNaN(stakeValue) || stakeValue <= 0) {
            toast.error("Please enter a valid stake amount.");
            return;
        }
        if (selectedBets.length === 0) {
            toast.error("Your bet slip is empty.");
            return;
        }
        // NEU: Überprüfung des Guthabens vor dem Absenden
        if (fantasyBalance !== null && stakeValue > fantasyBalance) {
            toast.error("Insufficient balance to place this bet.");
            return;
        }

        const selectionsToPlace: BetPlacementSelection[] = selectedBets.map(bet => ({
            available_bet_id: bet.id,
        }));
        await onPlaceBet(stakeValue, selectionsToPlace, currentBetType);
    };

    const renderSelectedBetItem = (bet: SelectedBetDisplayInfo) => {
        const decimalOddForDisplay = americanToDecimal(bet.odds);
        return (
            <div key={bet.id} className={`bg-sleeper-surface-200 p-3 rounded-md shadow ${isMobileView ? 'mb-2' : 'mb-3'}`}>
                <div className="flex justify-between items-start">
                    <div>
                        <p className={`font-semibold text-sleeper-text-primary ${isMobileView ? 'text-sm' : 'text-base'}`}>
                            {bet.selection_name}
                        </p>
                        <p className={`text-xs text-sleeper-text-secondary mt-0.5`}>
                            {bet.bet_type_name} {bet.line !== null && `(${bet.line > 0 ? `+${bet.line}` : bet.line})`}
                        </p>
                        {bet.home_team && bet.away_team && (
                            <p className={`text-xs text-sleeper-text-secondary/80 mt-0.5`}>
                                {bet.away_team} @ {bet.home_team}
                            </p>
                        )}
                    </div>
                    <div className="flex flex-col items-end ml-2">
                        <p className={`font-bold text-sleeper-accent ${isMobileView ? 'text-sm' : 'text-base'}`}>
                            {decimalOddForDisplay.toFixed(2)}
                        </p>
                        <button
                            onClick={() => onRemoveBet(bet.id)}
                            className="text-sleeper-text-secondary hover:text-sleeper-error mt-1 p-0.5"
                            aria-label="Remove selection"
                        >
                            <TrashIcon className="h-4 w-4" />
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className={`${isMobileView ? 'p-1 sm:p-2' : 'bg-sleeper-surface-100 p-4 rounded-lg shadow-md border border-sleeper-border'}`}>
            {!isMobileView && (
                <div className="flex justify-between items-center mb-4 pb-3 border-b border-sleeper-border">
                    <h2 className="text-xl font-semibold text-sleeper-text-primary flex items-center">
                        <TicketIcon className="h-6 w-6 mr-2 text-sleeper-primary" />
                        Bet Slip
                    </h2>
                    {selectedBets.length > 0 && (
                        <button onClick={onClearSlip} className="text-xs text-sleeper-text-secondary hover:text-sleeper-error font-medium flex items-center">
                            <TrashIcon className="h-4 w-4 mr-1" /> Clear All
                        </button>
                    )}
                </div>
            )}

            {selectedBets.length === 0 ? (
                <div className={`text-center py-6 ${isMobileView ? 'px-2' : 'px-4'}`}>
                    <TicketIcon className={`mx-auto h-12 w-12 mb-3 text-sleeper-text-secondary/60 ${isMobileView ? 'opacity-80' : ''}`} />
                    <p className={`font-semibold text-sleeper-text-primary ${isMobileView ? 'text-base' : 'text-lg'}`}>Your bet slip is empty.</p>
                    <p className={`text-sleeper-text-secondary mt-1 ${isMobileView ? 'text-xs' : 'text-sm'}`}>
                        Add selections from the game list to get started.
                    </p>
                </div>
            ) : (
                <div className={`space-y-2 ${isMobileView ? 'max-h-[calc(90vh-250px)] overflow-y-auto custom-scrollbar pr-1' : ''}`}>
                    {selectedBets.map(renderSelectedBetItem)}
                </div>
            )}

            {selectedBets.length > 0 && (
                <div className={`mt-4 ${isMobileView ? 'px-1 pb-1' : 'pt-4 border-t border-sleeper-border'}`}>
                    {selectedBets.length > 1 && (
                        <div className={`mb-3 ${isMobileView ? 'px-1' : ''}`}>
                            <span className="block text-xs font-medium text-sleeper-text-secondary mb-1">Bet Type</span>
                            <div className="flex w-full bg-sleeper-surface-200 rounded-md p-0.5 border border-sleeper-border">
                                <button
                                    onClick={() => setCurrentBetType('single')}
                                    className={`w-1/2 py-1.5 text-xs sm:text-sm font-semibold rounded-sm transition-colors
                                        ${currentBetType === 'single' ? 'bg-sleeper-primary text-white shadow-md' : 'text-sleeper-text-secondary hover:text-sleeper-text-primary'}`}
                                >
                                    Single ({selectedBets.length})
                                </button>
                                <button
                                    onClick={() => setCurrentBetType('parlay')}
                                    className={`w-1/2 py-1.5 text-xs sm:text-sm font-semibold rounded-sm transition-colors
                                        ${currentBetType === 'parlay' ? 'bg-sleeper-primary text-white shadow-md' : 'text-sleeper-text-secondary hover:text-sleeper-text-primary'}`}
                                >
                                    Parlay ({selectedBets.length})
                                </button>
                            </div>
                            {currentBetType === 'single' && (
                                <p className="text-xs text-sleeper-text-secondary/80 mt-1.5 px-0.5">
                                    Stake will be divided equally among {selectedBets.length} single bets.
                                </p>
                            )}
                        </div>
                    )}
                    <div className={`mb-3 ${isMobileView ? 'px-1' : ''}`}>
                        <label htmlFor="stake" className="block text-xs font-medium text-sleeper-text-secondary mb-1">
                            {currentBetType === 'single' && selectedBets.length > 1 ? 'Total Stake' : 'Stake'}
                        </label>
                        <div className="relative">
                            <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-sm text-sleeper-text-secondary">$</span>
                            <input
                                type="number"
                                id="stake"
                                value={stake}
                                onChange={(e) => onStakeChange(e.target.value)}
                                placeholder="0.00"
                                className={`w-full pl-7 pr-3 py-2 bg-sleeper-bg text-sleeper-text-primary border rounded-md shadow-sm 
                                            focus:outline-none focus:ring-2 focus:border-sleeper-primary 
                                            ${parseFloat(stake) <= 0 && stake !== '' ? 'border-sleeper-error focus:ring-sleeper-error' : 'border-sleeper-border focus:ring-sleeper-primary'}
                                            ${isMobileView ? 'text-sm' : 'text-base'}`}
                            />
                        </div>
                        {parseFloat(stake) > 0 && currentBetType === 'single' && selectedBets.length > 1 && (
                            <p className="text-xs text-sleeper-text-secondary/80 mt-1 px-0.5">
                                ${ (parseFloat(stake) / selectedBets.length).toFixed(2) } per bet
                            </p>
                        )}
                    </div>
                    <div className={`bg-sleeper-surface-200 p-3 rounded-md text-sm ${isMobileView ? 'mb-3' : 'mb-4'}`}>
                        <div className="flex justify-between items-center">
                            <span className="font-medium text-sleeper-text-secondary">
                                {currentBetType === 'parlay' ? 'Total Odds:' : 'Avg. Odds (Example):'}
                            </span>
                            <span className="font-bold text-sleeper-text-primary">{totalDecimalOdds.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between items-center mt-1 pt-2 border-t border-sleeper-border">
                            <span className="font-medium text-sleeper-text-primary">Potential Payout:</span>
                            <span className="font-bold text-sleeper-success">${potentialPayout.toFixed(2)}</span>
                        </div>
                    </div>
                    <button
                        onClick={handlePlaceBetClick}
                        disabled={isPlacingBet || !stake || parseFloat(stake) <= 0 || selectedBets.length === 0 || (fantasyBalance !== null && parseFloat(stake) > fantasyBalance) } // NEU: Guthabenprüfung im disabled-Status
                        className={`w-full bg-sleeper-accent hover:bg-sleeper-accent-hover text-sleeper-text-on-accent font-semibold rounded-md disabled:opacity-60 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-sleeper-accent focus:ring-offset-2 
                                    ${isMobileView ? 'py-3 text-base focus:ring-offset-sleeper-surface-100' : 'py-2.5 text-sm focus:ring-offset-sleeper-surface-100'}`}
                    >
                        {isPlacingBet ? (
                            <span className="flex items-center justify-center">
                                <svg className="animate-spin -ml-1 mr-3 h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25"></circle>
                                    <path d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" className="opacity-75" fill="currentColor"></path>
                                </svg>
                                Placing Bet...
                            </span>
                        ) : (
                            `Place ${currentBetType === 'parlay' ? 'Parlay' : selectedBets.length > 1 ? `${selectedBets.length} Single Bets` : 'Single Bet'}`
                        )}
                    </button>
                    {selectedBets.length > 0 && parseFloat(stake) > 0 && fantasyBalance !== null && parseFloat(stake) > fantasyBalance && (
                        <div className="mt-2 text-center">
                            <p className="text-xs text-sleeper-error flex items-center justify-center">
                                <ExclamationTriangleIcon className="h-4 w-4 mr-1" />
                                Insufficient balance.
                            </p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
export default BetSlip;