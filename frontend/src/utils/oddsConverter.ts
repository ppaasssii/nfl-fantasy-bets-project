// frontend/src/utils/oddsConverter.ts

/**
 * Konvertiert amerikanische Quoten (z.B. -110 oder +200) in Dezimalquoten (z.B. 1.91 oder 3.00).
 * @param americanOdds - Die amerikanische Quote als Zahl.
 * @returns Die Dezimalquote.
 */
export const americanToDecimal = (americanOdds: number): number => {
    if (americanOdds > 0) {
        return (americanOdds / 100) + 1;
    }
    if (americanOdds < 0) {
        return (100 / Math.abs(americanOdds)) + 1;
    }
    // Sollte nicht vorkommen, aber als Fallback
    return 1;
};

/**
 * Berechnet den potenziellen Gesamtgewinn (Einsatz + Reingewinn).
 * @param stake - Der gesetzte Betrag.
 * @param decimalOdds - Die Dezimalquote der Wette.
 * @returns Der potenzielle Auszahlungsbetrag.
 */
export const calculatePotentialPayout = (stake: number, decimalOdds: number): number => {
    return stake * decimalOdds;
};