// In supabase/functions/fetch-sports-data/_test.ts

// WICHTIG: Dies ist eine Testdatei. Du führst sie lokal mit Deno aus.
// BEFEHL: deno test --allow-all _test.ts

import { assertEquals } from "https://deno.land/std@0.177.0/testing/asserts.ts";

// --- Die zu testende Logik ---
// Dies ist eine vereinfachte Version der Logik, die du in getOrCreateBetType verwenden wirst.
function determineBetCategory(
    apiStatID: string,
    apiBetTypeID: string,
    apiPeriodID: string,
    marketNameFromAPI: string,
    statEntityIDFromAPI: string
) {
    let main_category = "Other";
    let sub_category: string | null = null;
    let calculated_market_name = marketNameFromAPI || `${apiStatID} ${apiBetTypeID}`;

    const isPlayerProp = !(statEntityIDFromAPI === 'home' || statEntityIDFromAPI === 'away' || statEntityIDFromAPI === 'all');

    if (apiBetTypeID === 'ml' && apiStatID === 'points' && !isPlayerProp) {
        main_category = 'Main';
        sub_category = 'Moneyline';
        calculated_market_name = apiPeriodID === 'reg' ? 'Winner (Regulation)' : 'Winner (Game)';
    } else if (apiBetTypeID === 'sp' && apiStatID === 'points' && !isPlayerProp) {
        main_category = 'Main';
        sub_category = 'Spread';
        calculated_market_name = apiPeriodID === 'reg' ? 'Point Spread (Regulation)' : 'Point Spread (Game)';
    } else if (apiBetTypeID === 'ou' && apiStatID === 'points' && statEntityIDFromAPI === 'all') {
        main_category = 'Total';
        sub_category = 'Game Total';
        calculated_market_name = apiPeriodID === 'reg' ? 'Total Points (Regulation)' : 'Total Points (Game)';
    } else if (isPlayerProp) {
        main_category = 'Player Props';
        if (apiStatID.includes('touchdown')) {
            sub_category = 'Touchdowns';
            calculated_market_name = marketNameFromAPI; // z.B. "Anytime Touchdown Scorer"
        } else if (apiStatID.startsWith('passing_')) {
            sub_category = 'Passing';
            calculated_market_name = `Player ${apiStatID.replace('passing_', '').replace(/_/g, ' ')}`; // Bsp: Player Passing Yards
        } else if (apiStatID.startsWith('rushing_')) {
            sub_category = 'Rushing';
            calculated_market_name = `Player ${apiStatID.replace('rushing_', '').replace(/_/g, ' ')}`;
        } else if (apiStatID.startsWith('receiving_')) {
            sub_category = 'Receiving';
            calculated_market_name = `Player ${apiStatID.replace('receiving_', '').replace(/_/g, ' ')}`;
        } else if (apiStatID.startsWith('defense_')) {
            sub_category = 'Defense';
            calculated_market_name = `Player ${apiStatID.replace('defense_', '').replace(/_/g, ' ')}`;
        } else if (apiStatID.startsWith('fieldGoals_') || apiStatID.startsWith('kicking_')) {
            sub_category = 'Kicking';
            calculated_market_name = `Player ${apiStatID.replace(/^(fieldGoals_|kicking_)/, '').replace(/_/g, ' ')}`;
        } else {
            sub_category = 'Other';
            calculated_market_name = marketNameFromAPI;
        }
    } else if (statEntityIDFromAPI === 'home' || statEntityIDFromAPI === 'away') {
        main_category = 'Team Props';
        sub_category = apiStatID;
        calculated_market_name = marketNameFromAPI;
    } else if (statEntityIDFromAPI === 'all') {
        main_category = 'Game Props';
        sub_category = apiStatID;
        calculated_market_name = marketNameFromAPI;
    }

    // Bereinige den Namen für die Lesbarkeit
    calculated_market_name = calculated_market_name.split(' Over/Under')[0].split(' Yes/No')[0].trim();

    return { main_category, sub_category, calculated_market_name };
}


// --- Hier definieren wir unsere Tests ---
Deno.test("Category Test: Game Moneyline", () => {
    const result = determineBetCategory("points", "ml", "game", "Moneyline", "home");
    assertEquals(result.main_category, "Main");
    assertEquals(result.sub_category, "Moneyline");
    assertEquals(result.calculated_market_name, "Winner (Game)");
});

Deno.test("Category Test: Game Spread", () => {
    const result = determineBetCategory("points", "sp", "game", "Spread", "away");
    assertEquals(result.main_category, "Main");
    assertEquals(result.sub_category, "Spread");
    assertEquals(result.calculated_market_name, "Point Spread (Game)");
});

Deno.test("Category Test: Game Total", () => {
    const result = determineBetCategory("points", "ou", "game", "Over/Under", "all");
    assertEquals(result.main_category, "Total");
    assertEquals(result.sub_category, "Game Total");
    assertEquals(result.calculated_market_name, "Total Points (Game)");
});

Deno.test("Category Test: Player Passing Yards", () => {
    const result = determineBetCategory("passing_yards", "ou", "game", "Patrick Mahomes Passing Yards Over/Under", "PATRICK_MAHOMES_1_NFL");
    assertEquals(result.main_category, "Player Props");
    assertEquals(result.sub_category, "Passing");
    assertEquals(result.calculated_market_name, "Player yards"); // Beachte, dass die Logik hier vereinfacht ist. Du kannst sie verfeinern.
});

Deno.test("Category Test: Player Anytime Touchdown", () => {
    const result = determineBetCategory("touchdowns", "yn", "game", "Christian McCaffrey Any Touchdowns Yes/No", "CMC_1_NFL");
    assertEquals(result.main_category, "Player Props");
    assertEquals(result.sub_category, "Touchdowns");
    assertEquals(result.calculated_market_name, "Christian McCaffrey Any Touchdowns");
});

Deno.test("Category Test: Team Total Points", () => {
    const result = determineBetCategory("points", "ou", "game", "Buffalo Bills Points Over/Under", "home");
    assertEquals(result.main_category, "Team Props");
    assertEquals(result.sub_category, "points");
    assertEquals(result.calculated_market_name, "Buffalo Bills Points");
});