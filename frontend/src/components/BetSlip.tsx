// src/components/BetSlip.tsx
import React, { useState, useEffect, useMemo } from 'react';
import { toast } from 'react-toastify';
import { calculatePotentialPayout } from '../utils/oddsConverter';
import { TrashIcon, TicketIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { type BetSlipOdd, type BetPlacementSelection } from '../types';

interface BetSlipProps {
    selectedBets: BetSlipOdd[];
    onRemoveBet: (id: number) => void;
    onClearSlip: () => void;
    onPlaceBet: (stake: number, selections: BetPlacementSelection[], betType: 'single' | 'parlay') => Promise<void>;
    isPlacingBet: boolean;
    stake: string;
    onStakeChange: (stake: string) => void;
    fantasyBalance: number | null;
    isInsideModal?: boolean;
}

const BetSlip: React.FC<BetSlipProps> = ({
                                             selectedBets,
                                             onRemoveBet,
                                             onClearSlip,
                                             onPlaceBet,
                                             isPlacingBet,
                                             stake,
                                             onStakeChange,
                                             fantasyBalance,
                                             isInsideModal
                                         }) => {
    const [currentBetType, setCurrentBetType] = useState<'single' | 'parlay'>('parlay');

    useEffect(() => {
        if (selectedBets.length > 1) {
            setCurrentBetType('parlay');
        } else {
            setCurrentBetType('single');
        }
    }, [selectedBets.length]);

    const { totalDecimalOdds, potentialPayout } = useMemo(() => {
        const stakeValue = parseFloat(stake);
        if (!stakeValue || selectedBets.length === 0) {
            const initialOdds = currentBetType === 'parlay' ? selectedBets.reduce((acc, bet) => acc * bet.odds_at_placement, 1) : 1;
            return { totalDecimalOdds: initialOdds, potentialPayout: 0 };
        }
        if (currentBetType === 'parlay') {
            const combinedOdds = selectedBets.reduce((acc, bet) => acc * bet.odds_at_placement, 1);
            return { totalDecimalOdds: combinedOdds, potentialPayout: calculatePotentialPayout(stakeValue, combinedOdds) };
        }
        const stakePerBet = stakeValue / selectedBets.length;
        const totalPayout = selectedBets.reduce((acc, bet) => acc + calculatePotentialPayout(stakePerBet, bet.odds_at_placement), 0);
        const averageOdds = selectedBets.length > 0 ? selectedBets.reduce((a, b) => a + b.odds_at_placement, 0) / selectedBets.length : 1;
        return { totalDecimalOdds: averageOdds, potentialPayout: totalPayout };
    }, [stake, selectedBets, currentBetType]);

    const handlePlaceBetClick = async () => {
        const stakeValue = parseFloat(stake);
        if (isNaN(stakeValue) || stakeValue <= 0) { toast.error("Please enter a valid stake amount."); return; }
        if (fantasyBalance !== null && stakeValue > fantasyBalance) { toast.error("Insufficient balance."); return; }
        const selectionsToPlace = selectedBets.map(bet => ({ available_bet_id: bet.id }));
        await onPlaceBet(stakeValue, selectionsToPlace, selectedBets.length > 1 ? currentBetType : 'single');
    };

    const renderBetList = () => (
        <div className="space-y-3">
            {selectedBets.map(bet => (
                <div key={bet.id} className="bg-sleeper-surface-200 p-3 rounded-md shadow">
                    <div className="flex justify-between items-start">
                        <div className="flex-grow pr-2">
                            <p className="font-semibold text-sleeper-text-primary text-sm">{bet.selection_name}</p>
                            <p className="text-xs text-sleeper-text-secondary mt-0.5">{bet.bet_type_name} {bet.line !== null && `(${bet.line > 0 ? `+${bet.line.toFixed(1)}` : bet.line.toFixed(1)})`}</p>
                            {bet.game_info_for_slip && <p className="text-xs text-sleeper-text-secondary/80 mt-0.5">{bet.game_info_for_slip.away_team} @ {bet.game_info_for_slip.home_team}</p>}
                        </div>
                        <div className="flex-shrink-0 flex flex-col items-end ml-2">
                            <p className="font-bold text-sleeper-accent text-sm">{bet.odds_at_placement.toFixed(2)}</p>
                            <button onClick={() => onRemoveBet(bet.id)} className="text-sleeper-text-secondary hover:text-sleeper-error mt-1 p-0.5" aria-label="Remove selection"><TrashIcon className="h-4 w-4" /></button>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );

    const renderControls = () => (
        <div className={!isInsideModal ? 'pt-4 border-t border-sleeper-border' : ''}>
            {selectedBets.length > 1 && (
                <div className="mb-4">
                    <span className="block text-xs font-medium text-sleeper-text-secondary mb-1">Bet Type</span>
                    <div className="flex w-full bg-sleeper-surface-200 rounded-md p-0.5 border border-sleeper-border">
                        <button onClick={() => setCurrentBetType('single')} className={`w-1/2 py-1.5 text-xs sm:text-sm font-semibold rounded-sm transition-colors ${currentBetType === 'single' ? 'bg-sleeper-primary text-white shadow-md' : 'text-sleeper-text-secondary hover:text-sleeper-text-primary'}`}>Single ({selectedBets.length})</button>
                        <button onClick={() => setCurrentBetType('parlay')} className={`w-1/2 py-1.5 text-xs sm:text-sm font-semibold rounded-sm transition-colors ${currentBetType === 'parlay' ? 'bg-sleeper-primary text-white shadow-md' : 'text-sleeper-text-secondary hover:text-sleeper-text-primary'}`}>Parlay</button>
                    </div>
                </div>
            )}
            <div className="mb-3">
                <label htmlFor="stake" className="block text-xs font-medium text-sleeper-text-secondary mb-1">{currentBetType === 'single' && selectedBets.length > 1 ? 'Total Stake' : 'Stake'}</label>
                <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-sm text-sleeper-text-secondary">$</span>
                    {/* KORREKTUR: min="0" hinzugefügt, um negative Werte zu verhindern */}
                    <input type="number" id="stake" value={stake} min="0" onChange={(e) => onStakeChange(e.target.value)} placeholder="0.00" className="w-full pl-7 pr-3 py-2 bg-sleeper-bg text-sleeper-text-primary border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:border-sleeper-primary border-sleeper-border focus:ring-sleeper-primary text-sm"/>
                </div>
                {parseFloat(stake) > 0 && currentBetType === 'single' && selectedBets.length > 1 && (<p className="text-xs text-sleeper-text-secondary/80 mt-1 px-0.5">${(parseFloat(stake) / selectedBets.length).toFixed(2)} per bet</p>)}
            </div>
            <div className="bg-sleeper-surface-200 p-3 rounded-md text-sm mb-4">
                <div className="flex justify-between items-center"><span className="font-medium text-sleeper-text-secondary">{currentBetType === 'parlay' ? 'Total Odds:' : 'Avg. Odds:'}</span><span className="font-bold text-sleeper-text-primary">{totalDecimalOdds.toFixed(2)}</span></div>
                <div className="flex justify-between items-center mt-1 pt-2 border-t border-sleeper-border"><span className="font-medium text-sleeper-text-primary">Potential Payout:</span><span className="font-bold text-sleeper-success">${potentialPayout.toFixed(2)}</span></div>
            </div>
            <button onClick={handlePlaceBetClick} disabled={isPlacingBet || !stake || parseFloat(stake) <= 0 || (fantasyBalance !== null && parseFloat(stake) > fantasyBalance)} className="w-full bg-sleeper-accent hover:bg-sleeper-accent-hover text-sleeper-text-on-accent font-semibold rounded-md disabled:opacity-60 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-sleeper-accent focus:ring-offset-2 py-3 text-base focus:ring-offset-sleeper-surface-100">
                {isPlacingBet ? "Placing Bet..." : `Place ${selectedBets.length > 1 ? currentBetType.charAt(0).toUpperCase() + currentBetType.slice(1) : 'Single Bet'}`}
            </button>
            {fantasyBalance !== null && parseFloat(stake) > fantasyBalance && (<p className="text-xs text-sleeper-error flex items-center justify-center mt-2"><ExclamationTriangleIcon className="h-4 w-4 mr-1" /> Insufficient balance</p>)}
        </div>
    );

    if (selectedBets.length === 0) {
        return (
            <div className="text-center py-6 px-2">
                <TicketIcon className="mx-auto h-12 w-12 mb-3 text-sleeper-text-secondary/60"/>
                <p className="font-semibold text-sleeper-text-primary text-base">Your bet slip is empty.</p>
                <p className="text-sleeper-text-secondary mt-1 text-xs">Add selections to get started.</p>
            </div>
        )
    }

    // KORREKTUR: bg-sleeper-surface-100 sorgt für einen soliden, nicht-transparenten Hintergrund
    if (isInsideModal) {
        return (<div className="flex flex-col h-full bg-sleeper-surface-100"><div className="flex-grow overflow-y-auto custom-scrollbar -mr-4 pr-4">{renderBetList()}</div><div className="flex-shrink-0 pt-4 mt-auto">{renderControls()}</div></div>)
    }

    return (
        <div className="bg-sleeper-surface-100 p-4 rounded-lg shadow-md border border-sleeper-border">
            <div className="flex justify-between items-center mb-4 pb-3 border-b border-sleeper-border"><h2 className="text-xl font-semibold text-sleeper-text-primary flex items-center"><TicketIcon className="h-6 w-6 mr-2 text-sleeper-primary" />Bet Slip</h2><button onClick={onClearSlip} className="text-xs text-sleeper-text-secondary hover:text-sleeper-error font-medium flex items-center"><TrashIcon className="h-4 w-4 mr-1" />Clear All</button></div>
            <div className="space-y-3 mb-4">{renderBetList()}</div>
            {renderControls()}
        </div>
    );
};
export default BetSlip;