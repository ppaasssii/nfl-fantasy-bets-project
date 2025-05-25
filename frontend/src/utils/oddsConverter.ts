// frontend/src/utils/oddsConverter.ts
export function americanToDecimal(americanOdds: number): number {
    if (americanOdds > 0) { // For positive odds (e.g., +150)
        return (americanOdds / 100) + 1;
    } else if (americanOdds < 0) { // For negative odds (e.g., -200)
        return (100 / Math.abs(americanOdds)) + 1;
    }
    // Should not happen with valid American odds (which are non-zero)
    // but as a fallback, return 1 (meaning no change to stake, or an invalid odd)
    console.warn(`Invalid American odd received for conversion: ${americanOdds}`);
    return 1;
}

// Calculates total return (stake + profit)
export function calculatePotentialPayout(stake: number, decimalOdds: number): number {
    if (stake <= 0 || decimalOdds <= 1) { // decimalOdds <= 1 means no profit or loss
        return stake; // At worst, return the stake if odds are 1 (push) or less
    }
    return stake * decimalOdds;
}

// Calculates just the profit
export function calculateProfit(stake: number, decimalOdds: number): number {
    const payout = calculatePotentialPayout(stake, decimalOdds);
    if (payout === stake) return 0; // If payout is just the stake back (e.g. odds of 1.0)
    return payout - stake;
}