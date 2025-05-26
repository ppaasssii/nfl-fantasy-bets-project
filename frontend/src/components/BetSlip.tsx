// frontend/src/components/BetSlip.tsx
import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { americanToDecimal, calculatePotentialPayout } from '../utils/oddsConverter';

export interface SelectedBetDisplayInfo {
    id: number;
    selection_name: string;
    odds: number; // American Odd
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
}

const BetSlip: React.FC<BetSlipProps> = ({ selectedBets, onRemoveBet, onClearSlip, onPlaceBet, isPlacingBet, stake, onStakeChange }) => {
    const [totalDecimalOdds, setTotalDecimalOdds] = useState<number>(1);
    const [potentialPayout, setPotentialPayout] = useState<number>(0);
    const [currentBetType, setCurrentBetType] = useState<'single' | 'parlay'>('single');

    useEffect(() => {
        if (selectedBets.length === 0) {
            setTotalDecimalOdds(1); setPotentialPayout(0); setCurrentBetType('single'); return;
        }
        let combinedDecimal = 1;
        if (selectedBets.length === 1) {
            setCurrentBetType('single');
            combinedDecimal = americanToDecimal(selectedBets[0].odds);
        } else {
            setCurrentBetType('parlay');
            combinedDecimal = selectedBets.reduce((acc, bet) => acc * americanToDecimal(bet.odds), 1);
        }
        setTotalDecimalOdds(combinedDecimal);
        const numericStake = parseFloat(stake);
        if (numericStake > 0 && combinedDecimal > 1) { setPotentialPayout(calculatePotentialPayout(numericStake, combinedDecimal)); }
        else if (numericStake > 0 && combinedDecimal === 1) { setPotentialPayout(numericStake); }
        else { setPotentialPayout(0); }
    }, [selectedBets, stake]);

    const handleStakeInputChange = (e: React.ChangeEvent<HTMLInputElement>) => { const val = e.target.value; if (/^\d*\.?\d{0,2}$/.test(val) || val === '') onStakeChange(val); };
    const handlePlaceBetClick = async () => {
        const numStake = parseFloat(stake);
        if (selectedBets.length === 0) { toast.warn('Add selections.'); return; }
        if (!numStake || numStake <= 0) { toast.warn('Valid stake needed.'); return; }
        const selectionsToPlace: BetPlacementSelection[] = selectedBets.map(b => ({ available_bet_id: b.id }));
        await onPlaceBet(numStake, selectionsToPlace, currentBetType);
    };

    if (selectedBets.length === 0 && !isPlacingBet) {
        return (
            <div className="p-6 bg-sleeper-surface-100 border border-sleeper-border rounded-xl shadow-xl text-center min-h-[200px] flex flex-col justify-center items-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="mx-auto h-12 w-12 text-sleeper-text-secondary opacity-60 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                </svg>
                <h3 className="text-lg font-semibold text-sleeper-primary mb-1">Bet Slip</h3>
                <p className="text-sm text-sleeper-text-secondary">Your bet slip is empty.</p>
                <p className="text-xs text-sleeper-text-secondary opacity-70 mt-1">Click odds to add selections.</p>
            </div>
        );
    }

    return (
        <div className={`p-4 bg-sleeper-surface-100 border border-sleeper-border rounded-xl shadow-xl space-y-4 min-h-[200px] ${isPlacingBet ? 'opacity-60 pointer-events-none' : ''}`}>
            <div className="flex justify-between items-center pb-3 border-b border-sleeper-border">
                <h3 className="text-xl font-semibold text-sleeper-primary">Bet Slip</h3>
                {selectedBets.length > 0 && (
                    <button onClick={onClearSlip} className="text-xs text-sleeper-error hover:text-red-400 font-medium disabled:opacity-50" title="Clear all" disabled={isPlacingBet}>
                        Clear All
                    </button>
                )}
            </div>

            {selectedBets.length > 0 && (
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1 custom-scrollbar">
                    {selectedBets.map((bet) => {
                        const decimalOddForDisplay = americanToDecimal(bet.odds);
                        return (
                            <div key={bet.id} className="bg-sleeper-surface-200 p-2.5 rounded-md text-xs flex justify-between items-center shadow-sm border border-sleeper-border/50">
                                <div>
                                    <p className="font-medium text-sleeper-text-primary text-sm leading-tight">{bet.selection_name}</p>
                                    <p className="text-sleeper-text-secondary text-xs leading-tight">{bet.bet_type_name}{bet.line ? ` (${bet.line > 0 ? `+${bet.line.toFixed(1)}` : bet.line.toFixed(1)})` : ''}</p>
                                    <p className="text-sleeper-interactive font-semibold">
                                        Odds: {decimalOddForDisplay.toFixed(2)}
                                    </p>
                                </div>
                                <button onClick={()=>onRemoveBet(bet.id)} className="text-sleeper-error hover:text-red-400 text-xl font-bold p-1 rounded-full hover:bg-sleeper-border/30 transition-colors" title="Remove" disabled={isPlacingBet}>
                                    ×
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}

            {isPlacingBet && selectedBets.length === 0 && (<p className="text-center text-sleeper-text-secondary py-4">Processing...</p>)}

            {selectedBets.length > 0 && (
                <>
                    <div className="pt-3 border-t border-sleeper-border">
                        <label htmlFor="stake-bs" className="block text-sm font-medium text-sleeper-text-secondary mb-1">Stake Amount ($)</label>
                        <input type="text" id="stake-bs" value={stake} onChange={handleStakeInputChange} placeholder="0.00"  className="w-full px-3 py-2 bg-sleeper-bg text-sleeper-text-primary border border-sleeper-border rounded-md focus:outline-none focus:ring-2 focus:ring-sleeper-primary shadow-inner placeholder:text-sleeper-text-secondary" disabled={isPlacingBet}/>
                    </div>

                    <div className="text-sm text-sleeper-text-secondary space-y-1.5 py-2 px-1">
                        <div className="flex justify-between"><span className="text-sleeper-text-secondary">Type:</span><span className="font-semibold text-sleeper-text-primary">{currentBetType.charAt(0).toUpperCase()+currentBetType.slice(1)}</span></div>
                        <div className="flex justify-between"><span className="text-sleeper-text-secondary">Selections:</span><span className="font-semibold text-sleeper-text-primary">{selectedBets.length}</span></div>
                        <div className="flex justify-between"><span className="text-sleeper-text-secondary">Total Odds (Decimal):</span><span className="font-semibold text-sleeper-text-primary">{totalDecimalOdds.toFixed(2)}</span></div>
                        <div className="flex justify-between items-center text-md mt-1 pt-2 border-t border-sleeper-border">
                            <span className="font-medium text-sleeper-text-primary">Potential Payout:</span>
                            <span className="font-bold text-sleeper-success">${potentialPayout.toFixed(2)}</span>
                        </div>
                    </div>

                    <button onClick={handlePlaceBetClick} disabled={isPlacingBet||!stake||parseFloat(stake)<=0||selectedBets.length===0}
                            className="w-full bg-sleeper-accent hover:bg-sleeper-accent-hover text-sleeper-text-on-accent font-semibold py-2.5 rounded-md disabled:opacity-60 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-sleeper-accent focus:ring-offset-2 focus:ring-offset-sleeper-surface-100">
                        {isPlacingBet?(<span className="flex items-center justify-center"><svg className="animate-spin -ml-1 mr-3 h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25"></circle><path d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" className="opacity-75" fill="currentColor"></path></svg>Placing...</span>):`Place ${currentBetType.charAt(0).toUpperCase()+currentBetType.slice(1)} Bet`}
                    </button>
                </>
            )}
        </div>
    );
};
export default BetSlip;