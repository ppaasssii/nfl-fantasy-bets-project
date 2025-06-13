// src/AppContext.ts
import { type Session } from '@supabase/supabase-js';
import { type BetSlipOdd, type BetPlacementSelection, type BetOption, type GameDetails } from './types';

export interface AppContextType {
    session: Session;
    fantasyBalance: number | null;
    loadingProfile: boolean;
    selectedBets: BetSlipOdd[];
    stake: string;
    setStake: (stake: string) => void;
    addToBetSlip: (
        odd: BetOption,
        gameContext: GameDetails,
        marketName: string,
        playerName?: string
    ) => void;
    removeFromBetSlip: (oddId: number) => void;
    clearBetSlip: () => void;
    isOddInBetSlip: (oddId: number) => boolean;
    placeBet: (stakeAmount: number, selectionsToPlace: BetPlacementSelection[], betType: 'single' | 'parlay') => Promise<void>;
    isPlacingBet: boolean;
}