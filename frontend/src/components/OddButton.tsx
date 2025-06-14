// src/components/OddButton.tsx
import React from 'react';
// KORREKTUR: 'QuickBetOption' wird zu 'BetOption'
import { type BetOption, type GameDetails } from '../types';
import { useAppOutletContext } from '../hooks';

interface OddButtonProps {
    option?: BetOption;
    game: GameDetails; // KORREKTUR: Erwartet jetzt das volle GameDetails Objekt
    marketName: string;
    lineLabel: React.ReactNode;
    playerName?: string;
    className?: string;
}

const OddButton: React.FC<OddButtonProps> = ({ option, game, marketName, lineLabel, playerName, className = '' }) => {
    const { addToBetSlip, isOddInBetSlip } = useAppOutletContext();

    const isDisabled = !option || typeof option.odds !== 'number';

    const handleQuickBetClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isDisabled || !option) return;

        addToBetSlip(option, game, marketName, playerName);
    };

    if (isDisabled) {
        return (
            <div className={`h-full w-full flex items-center justify-center text-sleeper-text-secondary text-sm font-semibold rounded-md border bg-sleeper-surface-200/50 border-sleeper-border/50 cursor-not-allowed ${className}`}>
                -
            </div>
        );
    }

    const isSelected = isOddInBetSlip(option.id);

    return (
        <button
            onClick={handleQuickBetClick}
            disabled={isDisabled}
            className={`
                h-full w-full flex flex-col items-center justify-center p-1 rounded-md border text-sm
                transition-colors duration-150 group
                ${isSelected
                ? 'bg-sleeper-primary text-white border-sleeper-primary'
                : 'bg-sleeper-surface-200 text-sleeper-text-primary border-sleeper-border hover:border-sleeper-primary/70 hover:bg-sleeper-primary/10'
            }
                ${className}
            `}
        >
            <span className="text-xs text-sleeper-text-secondary group-hover:text-sleeper-text-primary">{lineLabel}</span>
            <span className={`font-bold mt-0.5 ${isSelected ? 'text-white' : 'text-sleeper-accent'}`}>{option.odds.toFixed(2)}</span>
        </button>
    );
};

export default OddButton;