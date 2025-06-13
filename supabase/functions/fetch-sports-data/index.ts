// File: supabase/functions/fetch-sports-data/index.ts
// Version 8.0.0 - Production Ready: Handles dynamic test parameters, defaults for cron jobs, and fixes all schema errors.

import {serve} from 'https://deno.land/std@0.177.0/http/server.ts';
import {SupabaseClient} from 'https://esm.sh/@supabase/supabase-js@2';
import {corsHeaders} from '../_shared/cors.ts';
import {supabaseAdmin} from '../_shared/supabaseClient.ts';

const FUNCTION_VERSION = 'v8.0.0';
console.log(`[Info] Function booting up: fetch-sports-data (${FUNCTION_VERSION})`);

// --- Type Definitions for API Response ---
interface GameEvent {
    eventID: string;
    leagueID: string;
    type: string;
    teams: {
        home: { teamID: string; names: { long: string; medium: string; short: string; } };
        away: { teamID: string; names: { long: string; medium: string; short: string; } };
    };
    status: {
        cancelled: boolean;
        startsAt: string;
        completed: boolean;
    };
    odds: { [key: string]: OddData };
    players?: { [key: string]: PlayerData };
}

interface OddData {
    oddID: string;
    marketName?: string;
    statID: string;
    statEntityID: string;
    periodID: string;
    betTypeID: string;
    sideID: string;
    playerID?: string;
    bookOdds?: string;
    fairOdds?: string;
    bookSpread?: string;
    bookOverUnder?: string;
    bookOddsAvailable?: boolean;
    fairOddsAvailable?: boolean;
    lastUpdatedAt?: string;
}

interface PlayerData {
    name: string;
    teamID: string;
    firstName: string;
    lastName: string;
}

// --- Helper Functions ---

/**
 * Converts American odds (+150, -200) to decimal odds (2.5, 1.5).
 */
function americanToDecimal(americanOdds: number): number {
    if (americanOdds > 0) return (americanOdds / 100) + 1;
    if (americanOdds < 0) return (100 / Math.abs(americanOdds)) + 1;
    return 1;
}

/**
 * Extracts player name from API data, prioritizing the players object.
 */
function getPlayerName(oddData: OddData, eventPlayers?: { [key: string]: PlayerData }): string | undefined {
    const playerLookupID = oddData.playerID || oddData.statEntityID;
    if (playerLookupID && eventPlayers && eventPlayers[playerLookupID]) {
        return eventPlayers[playerLookupID].name;
    }
    // Fallback to parsing the market name if it's a player prop
    if (oddData.marketName && !(oddData.statEntityID === 'home' || oddData.statEntityID === 'away' || oddData.statEntityID === 'all')) {
        const nameMatch = oddData.marketName.match(/^([A-Za-z.'\- ]+?)\s+(Points|Touchdown|Yards|Receptions|Attempts|Completions|Interceptions|Rating|Sacks|Tackles|Assists|Goals|Score)/i);
        if (nameMatch && nameMatch[1]) {
            return nameMatch[1].trim();
        }
    }
    return undefined;
}

/**
 * Finds or creates a bet type in the database based on its unique characteristics.
 * Caches results in memory for the duration of the function run to minimize DB queries.
 */
async function getOrCreateBetType(
    sbClient: SupabaseClient,
    apiStatID: string,
    apiBetTypeID: string,
    apiPeriodID: string,
    marketNameFromAPI: string,
    statEntityIDFromAPI: string
): Promise<number | null> {

    let main_category = "Other";
    let sub_category: string | null = null;
    let calculated_market_name = marketNameFromAPI.split(' Over/Under')[0].split(' Yes/No')[0].trim();
    const isPlayerProp = !(statEntityIDFromAPI === 'home' || statEntityIDFromAPI === 'away' || statEntityIDFromAPI === 'all');

    // --- Logic to categorize the bet market ---
    if (apiBetTypeID === 'ml' && apiStatID === 'points' && !isPlayerProp) {
        main_category = 'Main';
        sub_category = 'Moneyline';
        calculated_market_name = apiPeriodID === 'reg' ? 'Winner (Regulation)' : 'Winner';
    } else if (apiBetTypeID === 'sp' && apiStatID === 'points' && !isPlayerProp) {
        main_category = 'Main';
        sub_category = 'Spread';
        calculated_market_name = apiPeriodID === 'reg' ? 'Point Spread (Regulation)' : 'Point Spread';
    } else if (apiBetTypeID === 'ou' && apiStatID === 'points' && statEntityIDFromAPI === 'all') {
        main_category = 'Total';
        sub_category = 'Game Total';
        calculated_market_name = apiPeriodID === 'reg' ? 'Total Points (Regulation)' : 'Total Points';
    } else if (isPlayerProp) {
        if (apiStatID.startsWith('passing_')) sub_category = 'Player Passing';
        else if (apiStatID.startsWith('rushing_')) sub_category = 'Player Rushing';
        else if (apiStatID.startsWith('receiving_')) sub_category = 'Player Receiving';
        else if (apiStatID.includes('touchdown')) sub_category = 'Player Touchdowns';
        else if (apiStatID.startsWith('defense_')) sub_category = 'Player Defense';
        else if (apiStatID.startsWith('kicking_') || apiStatID.startsWith('fieldGoals_')) sub_category = 'Player Kicking';
        else sub_category = 'Player Other';
        main_category = sub_category;
    } else if (statEntityIDFromAPI === 'home' || statEntityIDFromAPI === 'away') {
        main_category = 'Team Props';
        sub_category = apiStatID;
    } else if (statEntityIDFromAPI === 'all') {
        main_category = 'Game Props';
        sub_category = apiStatID;
    }

    // Use a unique key that matches the DB constraint for caching
    const uniqueKey = `${apiStatID}|${apiBetTypeID}|${calculated_market_name}`;

    const cache = (globalThis as any).betTypeCache || new Map();
    if (cache.has(uniqueKey)) {
        return cache.get(uniqueKey);
    }

    const {
        data,
        error
    } = await sbClient.from('bet_types').select('id').eq('market_name', calculated_market_name).eq('api_stat_id', apiStatID).eq('api_bet_type_id', apiBetTypeID).maybeSingle();
    if (error) {
        console.error(`[BetType] Error fetching for key ${uniqueKey}:`, error);
        return null;
    }
    if (data) {
        if (!(globalThis as any).betTypeCache) (globalThis as any).betTypeCache = new Map();
        (globalThis as any).betTypeCache.set(uniqueKey, data.id);
        return data.id;
    }

    const {data: newData, error: insertError} = await sbClient.from('bet_types').insert({
        api_stat_id: apiStatID,
        api_bet_type_id: apiBetTypeID,
        market_name: calculated_market_name,
        main_category: main_category,
        sub_category: sub_category,
        description: `API: ${marketNameFromAPI}`
    }).select('id').single();
    if (insertError) {
        console.error(`[BetType] Error inserting for key ${uniqueKey}:`, insertError);
        return null;
    }

    console.log(`[BetType] Created new type: "${calculated_market_name}" (Main: ${main_category}, Sub: ${sub_category})`);
    if (!(globalThis as any).betTypeCache) (globalThis as any).betTypeCache = new Map();
    (globalThis as any).betTypeCache.set(uniqueKey, newData.id);
    return newData.id;
}


serve(async (req: Request) => {
    // Standard CORS preflight request handling
    if (req.method === 'OPTIONS') {
        return new Response('ok', {headers: corsHeaders});
    }

    try {
        // 1. Get API Key from Supabase Secrets
        const apiKey = Deno.env.get('SPORTS_GAME_ODDS_API_KEY');
        if (!apiKey || apiKey.trim().length === 0) {
            throw new Error('SPORTS_GAME_ODDS_API_KEY environment variable is not set or empty.');
        }

        // 2. Construct API URL dynamically
        const requestUrl = new URL(req.url);
        const urlParams = requestUrl.searchParams;

        // Default to fetching the next 7 days if no parameters are provided (for cron jobs)
        const startsAfter = urlParams.get('startsAfter') || new Date().toISOString();
        const startsBefore = urlParams.get('startsBefore') || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

        console.log(`[Info] Fetching games from ${startsAfter} to ${startsBefore}`);

        const apiBaseUrl = 'https://api.sportsgameodds.com/v2/events/';
        const query = new URLSearchParams({
            sportID: 'FOOTBALL',
            leagueID: 'NFL',
            limit: urlParams.get('limit') || '50', // Allow overriding limit for testing
            startsAfter: startsAfter,
            startsBefore: startsBefore,
        });

        const finalApiUrl = `${apiBaseUrl}?${query.toString()}`;

        // 3. Fetch data from external API using the correct header authentication
        const apiResponse = await fetch(finalApiUrl, {
            headers: {
                'X-Api-Key': apiKey.trim()
            }
        });

        if (!apiResponse.ok) {
            throw new Error(`API request failed with status ${apiResponse.status}: ${await apiResponse.text()}`);
        }

        const jsonData: { data: GameEvent[] } = await apiResponse.json();
        const eventsData = jsonData.data;

        if (!eventsData || !Array.isArray(eventsData)) {
            throw new Error('Invalid data structure from API.');
        }

        // 4. Process and upsert data into the database
        console.log(`[Info] Received ${eventsData.length} events from API. Processing...`);
        let gamesUpsertedCount = 0;
        let betsUpsertedCount = 0;
        (globalThis as any).betTypeCache = new Map(); // Reset cache for this run

        for (const event of eventsData) {
            if (event.type !== 'match' || event.status?.cancelled) continue;

            const {
                data: gameUpsertResult,
                error: gameError
            } = await supabaseAdmin.from('games').upsert({
                api_game_id: event.eventID,
                home_team: event.teams.home.names.long,
                away_team: event.teams.away.names.long,
                game_time: event.status.startsAt,
                status: event.status.completed ? 'Final' : 'Scheduled',
                api_response_data: event
            }, {onConflict: 'api_game_id'}).select('id').single();
            if (gameError) {
                console.error(`[Error] Upserting game ${event.eventID}:`, gameError.message);
                continue;
            }
            if (!gameUpsertResult) {
                console.warn(`[Warn] Did not get ID back for upserted game ${event.eventID}`);
                continue;
            }
            gamesUpsertedCount++;
            const dbGameId = gameUpsertResult.id;

            if (!event.odds) continue;
            const betsToUpsert = [];
            for (const apiOddIDKey in event.odds) {
                const oddData = event.odds[apiOddIDKey];

                // Filter for game-level odds and ensure they are available
                if ((oddData.periodID !== 'game' && oddData.periodID !== 'reg') || oddData.bookOddsAvailable === false || !oddData.bookOdds) {
                    continue;
                }

                // Perform validation on odds and lines
                const americanOddNumeric = parseFloat(oddData.bookOdds.replace('−', '-'));
                if (isNaN(americanOddNumeric)) continue;
                const oddsInDecimal = americanToDecimal(americanOddNumeric);
                if (oddsInDecimal < 1.01 || oddsInDecimal > 200) {
                    console.warn(`[Validate] Skipping odd ${apiOddIDKey}: Unrealistic odds (${oddsInDecimal}).`);
                    continue;
                }

                const betTypeId = await getOrCreateBetType(supabaseAdmin, oddData.statID, oddData.betTypeID, oddData.periodID, oddData.marketName || 'Unknown Market', oddData.statEntityID);
                if (!betTypeId) {
                    console.warn(`[Warn] Could not get/create bet_type for odd ${apiOddIDKey}. Skipping.`);
                    continue;
                }

                const playerName = getPlayerName(oddData, event.players);
                let lineValue: number | null = null;
                if (oddData.bookSpread !== null && oddData.bookSpread !== undefined) lineValue = parseFloat(oddData.bookSpread);
                else if (oddData.bookOverUnder !== null && oddData.bookOverUnder !== undefined) lineValue = parseFloat(oddData.bookOverUnder);
                if (lineValue !== null && isNaN(lineValue)) lineValue = null;

                // Generate a user-friendly name for the specific bet option
                let displaySelectionName = oddData.sideID || 'N/A';
                const homeShort = event.teams.home.names.short;
                const awayShort = event.teams.away.names.short;
                if (oddData.betTypeID === 'ml' || oddData.betTypeID === 'ml3way') {
                    if (oddData.statEntityID === 'home') displaySelectionName = homeShort; else if (oddData.statEntityID === 'away') displaySelectionName = awayShort; else displaySelectionName = oddData.sideID?.charAt(0).toUpperCase() + oddData.sideID?.slice(1) || 'N/A';
                } else if (oddData.betTypeID === 'sp' && lineValue !== null) {
                    const teamName = oddData.statEntityID === 'home' ? homeShort : awayShort;
                    displaySelectionName = `${teamName} ${lineValue > 0 ? '+' : ''}${lineValue.toFixed(1)}`;
                } else if (oddData.betTypeID === 'ou' && lineValue !== null) {
                    const sideDisplayName = oddData.sideID ? (oddData.sideID.charAt(0).toUpperCase() + oddData.sideID.slice(1)) : '';
                    displaySelectionName = `${sideDisplayName} ${lineValue.toFixed(1)}`;
                } else if (oddData.betTypeID === 'yn' || oddData.betTypeID === 'eo') {
                    displaySelectionName = oddData.sideID.charAt(0).toUpperCase() + oddData.sideID.slice(1);
                }

                betsToUpsert.push({
                    game_id: dbGameId,
                    bet_type_id: betTypeId,
                    api_odd_id: apiOddIDKey,
                    api_stat_id: oddData.statID,
                    api_stat_entity_id: oddData.statEntityID,
                    api_period_id: oddData.periodID,
                    api_bet_type_id: oddData.betTypeID,
                    api_side_id: oddData.sideID,
                    player_name_extracted: playerName,
                    selection_name_api: oddData.marketName,
                    display_name: displaySelectionName,
                    odds: oddsInDecimal,
                    line: lineValue,
                    is_active: oddData.bookOddsAvailable,
                    last_api_update: new Date().toISOString(),
                    bookmaker_name: 'consensus'
                });
            }

            if (betsToUpsert.length > 0) {
                const {error: upsertError} = await supabaseAdmin.from('available_bets').upsert(betsToUpsert, {onConflict: 'game_id, api_odd_id'});
                if (upsertError) console.error(`[Error] Upserting ${betsToUpsert.length} bets for game ${dbGameId}:`, upsertError.message); else betsUpsertedCount += betsToUpsert.length;
            }
        }

        const summary = `Run complete. Games processed: ${gamesUpsertedCount}. Bets upserted: ${betsUpsertedCount}.`;
        console.log(`[Success] ${summary}`);
        return new Response(JSON.stringify({success: true, message: summary}), {headers: corsHeaders});

    } catch (error) {
        console.error('[FATAL] Unhandled error in fetch-sports-data:', error);
        return new Response(JSON.stringify({
            error: 'Failed to fetch and process sports data.',
            details: error.message
        }), {
            status: 500,
            headers: {...corsHeaders, 'Content-Type': 'application/json'},
        });
    }
});