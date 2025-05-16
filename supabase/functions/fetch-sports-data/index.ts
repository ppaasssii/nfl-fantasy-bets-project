// File: supabase/functions/fetch-sports-data/index.ts

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { corsHeaders } from '../_shared/cors.ts';

console.log('[Info] fetch-sports-data function booting up (V2 API - NFL Focus - v4.5.4 - Robust bookmakerID check)');

// Interface definitions (ensure these are complete based on API and your needs)
interface StatusObject {
  hardStart?: boolean; delayed?: boolean; cancelled?: boolean; startsAt?: string;
  started?: boolean; displayShort?: string; completed?: boolean; displayLong?: string;
  ended?: boolean; live?: boolean; finalized?: boolean; currentPeriodID?: string;
  previousPeriodID?: string; oddsPresent?: boolean; oddsAvailable?: boolean;
}

interface OddData {
  oddID_key: string; sportID: string; leagueID: string; eventID: string; bookmakerID?: string; // Made bookmakerID optional
  periodID: string; statEntityID: string; betTypeID: string; sideID: string;
  odds: string; line?: string; lastUpdate: string; playerID?: string;
  marketName?: string; statID?: string; opposingOddID?: string;
  fairOdds?: string; bookOdds?: string; fairOverUnder?: string; bookOverUnder?: string;
  score?: number; scoringSupported?: boolean;
}

interface EventData {
  eventID: string; sportID: string; leagueID: string;
  startsAt: string; status: StatusObject;
  homeTeamName?: string; awayTeamName?: string;
  teams?: { home: { name: string; teamID: string; }; away: { name: string; teamID: string; }; };
  odds: Record<string, OddData>;
  lastUpdate: string;
}

interface V2ApiResponseDataField {
  events?: EventData[];
  nextCursor?: string;
}

interface V2ApiResponse {
  success: boolean; message?: string;
  data?: EventData[] | V2ApiResponseDataField;
  error?: string;
}

interface BetTypeRecord { id: number; name: string; api_market_key: string; description?: string; }

function getSupabaseAdminClient(): SupabaseClient {
  const supabaseUrl = Deno.env.get('APP_SUPABASE_URL');
  const supabaseServiceRoleKey = Deno.env.get('APP_SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    console.error('[Error_Critical] APP_SUPABASE_URL or APP_SUPABASE_SERVICE_ROLE_KEY is missing. Check supabase/.env.');
    throw new Error('Missing critical APP_SUPABASE_URL or APP_SUPABASE_SERVICE_ROLE_KEY for Supabase admin client.');
  }
  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

serve(async (_req) => {
  if (_req.method === 'OPTIONS') { return new Response('ok', { headers: corsHeaders }); }

  try {
    const supabaseAdmin = getSupabaseAdminClient();
    console.log('[Info] Supabase admin client initialized.');

    const { data: betTypesData, error: betTypesError } = await supabaseAdmin
        .from('bet_types')
        .select('id, name, api_market_key, description');
    if (betTypesError) { console.error('[Error_DB] Error fetching bet types:', betTypesError); throw betTypesError; }

    const betTypeMapping = new Map<string, BetTypeRecord>();
    betTypesData?.forEach(bt => betTypeMapping.set(bt.api_market_key, bt as BetTypeRecord));
    console.log(`[Info] Bet types fetched and mapped (count): ${betTypeMapping.size}`);

    const SPORTS_GAME_ODDS_API_KEY = Deno.env.get('SPORTS_GAME_ODDS_API_KEY');
    if (!SPORTS_GAME_ODDS_API_KEY) { console.error('[Error_Critical] SPORTS_GAME_ODDS_API_KEY env var not set.'); throw new Error('SPORTS_GAME_ODDS_API_KEY env var not set.'); }

    const sportIdentifierForAPI = 'FOOTBALL';
    const leagueIdentifierForAPI = 'NFL';
    const bookmakerForFairOdds = 'draftkings'; // Target bookmaker

    const eventParams = new URLSearchParams({
      sportID: sportIdentifierForAPI, leagueID: leagueIdentifierForAPI,
      bookmakerID: bookmakerForFairOdds, // Still request for this bookmaker
      limit: "10",
    });

    const queryStartsAfter = '2024-10-01T00:00:00Z';
    const queryStartsBefore = '2024-10-08T23:59:59Z';

    eventParams.set('startsAfter', queryStartsAfter);
    eventParams.set('startsBefore', queryStartsBefore);
    console.log(`[Info] --- Querying ${leagueIdentifierForAPI} events between: ${queryStartsAfter} and ${queryStartsBefore} with limit ${eventParams.get('limit')} ---`);

    const eventsApiUrl = `https://api.sportsgameodds.com/v2/events/?${eventParams.toString()}`;
    console.log(`[Info] Fetching events from V2 API: ${eventsApiUrl}`);
    console.log(`[DEBUG] Using API Key: "${SPORTS_GAME_ODDS_API_KEY}"`);

    const eventsResponse = await fetch(eventsApiUrl, {
      method: 'GET', headers: { 'X-Api-Key': SPORTS_GAME_ODDS_API_KEY },
    });

    console.log(`[Info] V2 Events API response status: ${eventsResponse.status}`);
    if (!eventsResponse.ok) {
      const errorBody = await eventsResponse.text();
      console.error(`[Error_API] API Error: ${eventsResponse.status} ${eventsResponse.statusText} - Body: ${errorBody}`);
      throw new Error(`Failed to fetch events from V2 API: ${eventsResponse.statusText} - ${errorBody}`);
    }

    const eventsResult = (await eventsResponse.json()) as V2ApiResponse;
    let fetchedEvents: EventData[] = [];

    if (eventsResult.success && eventsResult.data) {
      if (Array.isArray(eventsResult.data)) { fetchedEvents = eventsResult.data; }
      else if (eventsResult.data.events && Array.isArray(eventsResult.data.events)) { fetchedEvents = eventsResult.data.events; }
      if (!Array.isArray(eventsResult.data) && eventsResult.data.nextCursor) { console.log(`[Info] API response includes nextCursor: ${eventsResult.data.nextCursor}`); }
    } else if (!eventsResult.success) {
      console.error('[Error_API_Structure] API call indicates failure. Full Response:', JSON.stringify(eventsResult, null, 2));
      throw new Error(eventsResult.message || eventsResult.error || 'API returned success=false.');
    }

    console.log(`[Info] Received ${fetchedEvents.length} ${leagueIdentifierForAPI} event(s) from V2 API.`);
    if (fetchedEvents.length === 0) {
      console.log('[Info] No events returned from API for the specified parameters. Function will complete without processing games/odds.');
    }

    let gamesUpserted = 0;
    let availableBetsInserted = 0;
    const processingStats = { /* ... as before ... */
      mainMarketsProcessed: 0, periodMarketsProcessed: 0, playerMarketsProcessed: 0,
      unknownOddFormatSkipped: 0, noBetTypeMappingSkipped: 0,
      emptySelectionNameSkipped: 0, noOddsValueSkipped: 0,
    };

    for (const event of fetchedEvents) {
      let gameStatus = 'unknown';
      if (event.status && typeof event.status.displayLong === 'string') { gameStatus = event.status.displayLong.toLowerCase(); }
      else if (event.status && typeof event.status.displayShort === 'string') { gameStatus = event.status.displayShort.toLowerCase(); }

      const eventHomeTeamName = event.teams?.home?.name || event.homeTeamName || 'Unknown Home';
      const eventAwayTeamName = event.teams?.away?.name || event.awayTeamName || 'Unknown Away';
      console.log(`[Info_Event] Processing event: ${event.eventID} (${eventAwayTeamName} vs ${eventHomeTeamName}), API Status: ${gameStatus}`);

      const { data: gameData, error: gameError } = await supabaseAdmin
          .from('games')
          .upsert({
            api_game_id: event.eventID, home_team: eventHomeTeamName, away_team: eventAwayTeamName,
            game_time: event.startsAt || event.status?.startsAt || new Date(0).toISOString(),
            status: gameStatus, last_odds_update: new Date().toISOString(),
          }, { onConflict: 'api_game_id' })
          .select('id, home_team, away_team').single();

      if (gameError) { console.error(`[Error_DB_GameUpsert] for game ${event.eventID}:`, gameError); continue; }
      if (!gameData) { console.error(`[Error_DB_GameUpsertReturn] No data for game ${event.eventID}.`); continue; }

      gamesUpserted++;
      const currentGameId = gameData.id;
      const confirmedHomeTeamName = gameData.home_team;
      const confirmedAwayTeamName = gameData.away_team;
      const availableBetsToInsert = [];

      if (event.odds && typeof event.odds === 'object' && !Array.isArray(event.odds)) {
        for (const oddData of Object.values(event.odds as Record<string, OddData>)) {
          // ---- ADDED CHECK FOR oddData.bookmakerID before toLowerCase() ----
          if (!oddData.bookmakerID || typeof oddData.bookmakerID !== 'string' || oddData.bookmakerID.toLowerCase() !== bookmakerForFairOdds.toLowerCase()) {
            // console.log(`[DEBUG_BookmakerSkip] Skipping odd ${oddData.oddID_key} - bookmaker: ${oddData.bookmakerID}`);
            continue;
          }
          // ---- END OF ADDED CHECK ----

          if (!oddData.odds || oddData.odds.trim() === "") { processingStats.noOddsValueSkipped++; continue; }
          try { parseFloat(oddData.odds); } catch (e) { processingStats.noOddsValueSkipped++; continue; }

          let internalMarketKey: string | undefined = undefined;
          let selectionName: string | undefined = undefined;
          let mappedBetType: BetTypeRecord | undefined = undefined;
          let lineValue: number | undefined = oddData.line ? parseFloat(oddData.line) : undefined;

          // Player Props
          if (oddData.statEntityID && oddData.statEntityID.toLowerCase() !== 'home' && oddData.statEntityID.toLowerCase() !== 'away' && oddData.statEntityID.toLowerCase() !== 'all') {
            const parts = oddData.oddID_key.split('-');
            if (parts.length >= 4) {
              const stat = parts[0]; const betTypeAbbr = parts[parts.length - 2];
              internalMarketKey = `player_${stat}_${betTypeAbbr}`;
              mappedBetType = betTypeMapping.get(internalMarketKey);
              if (mappedBetType) {
                const playerNameForDisplay = oddData.playerID?.split('_').slice(0, -2).join(' ').replace(/_/g, ' ') || oddData.statEntityID.split('_').slice(0, -2).join(' ').replace(/_/g, ' ');
                if (betTypeAbbr === 'ou' && lineValue !== undefined) {
                  selectionName = `${playerNameForDisplay} ${mappedBetType.name.replace('Player ', '').replace(' O/U','')} ${oddData.sideID === 'over' ? 'Over' : 'Under'} ${lineValue}`;
                } else if (betTypeAbbr === 'yn') {
                  selectionName = `${playerNameForDisplay} ${mappedBetType.name.replace('Player ', '').replace(' Yes/No','')} ${oddData.sideID === 'yes' ? 'Yes' : 'No'}`;
                } else { selectionName = `${playerNameForDisplay} ${mappedBetType.name.replace('Player ', '')} - ${oddData.sideID}`; }
                processingStats.playerMarketsProcessed++;
              }
            }
          }
          // Period Specific Markets
          else if (['1h', '2h', '1q', '2q', '3q', '4q'].includes(oddData.periodID)) {
            const periodPrefix = oddData.periodID;
            if (oddData.betTypeID === 'ml') internalMarketKey = `${periodPrefix}_ml`;
            else if (oddData.betTypeID === 'sp') internalMarketKey = `${periodPrefix}_sp`;
            else if (oddData.betTypeID === 'ou' && oddData.statEntityID === 'all') internalMarketKey = `${periodPrefix}_totals_ou`;
            else if (oddData.betTypeID === 'ou' && oddData.statEntityID === 'home') internalMarketKey = `${periodPrefix}_team_points_home_ou`;
            else if (oddData.betTypeID === 'ou' && oddData.statEntityID === 'away') internalMarketKey = `${periodPrefix}_team_points_away_ou`;
            else if (oddData.betTypeID === 'eo' && oddData.statEntityID === 'all') internalMarketKey = `${periodPrefix}_total_eo`;
            else if (oddData.betTypeID === 'eo' && oddData.statEntityID === 'home') internalMarketKey = `${periodPrefix}_team_points_home_eo`;
            else if (oddData.betTypeID === 'eo' && oddData.statEntityID === 'away') internalMarketKey = `${periodPrefix}_team_points_away_eo`;
            mappedBetType = betTypeMapping.get(internalMarketKey || '');
            if(mappedBetType && internalMarketKey) {
              if (internalMarketKey.endsWith('_ml')) selectionName = oddData.statEntityID === 'home' ? confirmedHomeTeamName : confirmedAwayTeamName;
              else if (internalMarketKey.endsWith('_sp')) selectionName = `${oddData.statEntityID === 'home' ? confirmedHomeTeamName : confirmedAwayTeamName} ${lineValue !== undefined && lineValue > 0 ? '+' : ''}${lineValue}`;
              else if (internalMarketKey.includes('_totals_ou') || internalMarketKey.includes('_team_points')) {
                let prefix = '';
                if (internalMarketKey.includes('team_points_home')) prefix = `${confirmedHomeTeamName} `; else if (internalMarketKey.includes('team_points_away')) prefix = `${confirmedAwayTeamName} `;
                selectionName = `${prefix}${oddData.sideID === 'over' ? 'Over' : 'Under'} ${lineValue}`;
              } else if (internalMarketKey.endsWith('_eo')) selectionName = oddData.sideID === 'even' ? 'Even' : 'Odd';
              processingStats.periodMarketsProcessed++;
            }
          }
          // Main Game Markets
          else if (oddData.periodID === 'game' || oddData.periodID === 'reg') {
            if (oddData.betTypeID === 'ml') internalMarketKey = 'h2h';
            else if (oddData.betTypeID === 'sp') internalMarketKey = 'spreads';
            else if (oddData.betTypeID === 'ou' && oddData.statEntityID === 'all') internalMarketKey = 'totals';
            else if (oddData.betTypeID === 'ou' && oddData.statEntityID === 'home') internalMarketKey = 'team_points_home_ou';
            else if (oddData.betTypeID === 'ou' && oddData.statEntityID === 'away') internalMarketKey = 'team_points_away_ou';
            else if (oddData.betTypeID === 'eo' && oddData.statEntityID === 'all') internalMarketKey = 'game_total_eo';
            else if (oddData.betTypeID === 'eo' && oddData.statEntityID === 'home') internalMarketKey = 'team_points_home_eo';
            else if (oddData.betTypeID === 'eo' && oddData.statEntityID === 'away') internalMarketKey = 'team_points_away_eo';
            else if (oddData.betTypeID === 'ml3way' && oddData.periodID === 'reg') {
              if (['home', 'away', 'draw'].includes(oddData.sideID)) internalMarketKey = 'reg_ml3way';
              else if (['home+draw', 'away+draw', 'not_draw'].includes(oddData.sideID)) internalMarketKey = 'reg_double_chance';
            }
            mappedBetType = betTypeMapping.get(internalMarketKey || '');
            if(mappedBetType && internalMarketKey) {
              if (internalMarketKey === 'h2h') selectionName = oddData.statEntityID === 'home' ? confirmedHomeTeamName : confirmedAwayTeamName;
              else if (internalMarketKey === 'spreads') selectionName = `${oddData.statEntityID === 'home' ? confirmedHomeTeamName : confirmedAwayTeamName} ${lineValue !== undefined && lineValue > 0 ? '+' : ''}${lineValue}`;
              else if (internalMarketKey === 'totals') selectionName = `${oddData.sideID === 'over' ? 'Over' : 'Under'} ${lineValue}`;
              else if (internalMarketKey === 'team_points_home_ou') selectionName = `${confirmedHomeTeamName} ${oddData.sideID === 'over' ? 'Over' : 'Under'} ${lineValue}`;
              else if (internalMarketKey === 'team_points_away_ou') selectionName = `${confirmedAwayTeamName} ${oddData.sideID === 'over' ? 'Over' : 'Under'} ${lineValue}`;
              else if (internalMarketKey.endsWith('_eo')) selectionName = oddData.sideID === 'even' ? 'Even' : 'Odd';
              else if (internalMarketKey === 'reg_ml3way') { if (oddData.sideID === 'home') selectionName = confirmedHomeTeamName; else if (oddData.sideID === 'away') selectionName = confirmedAwayTeamName; else if (oddData.sideID === 'draw') selectionName = 'Draw'; }
              else if (internalMarketKey === 'reg_double_chance') { if (oddData.sideID === 'home+draw') selectionName = `${confirmedHomeTeamName} or Draw`; else if (oddData.sideID === 'away+draw') selectionName = `${confirmedAwayTeamName} or Draw`; else if (oddData.sideID === 'not_draw') selectionName = `${confirmedHomeTeamName} or ${confirmedAwayTeamName}`; }
              processingStats.mainMarketsProcessed++;
            }
          } else { processingStats.unknownOddFormatSkipped++; continue; }

          if (!mappedBetType) { processingStats.noBetTypeMappingSkipped++; continue; }
          if (!selectionName || selectionName.trim() === '' || selectionName.includes('undefined')) {
            console.error(`[Error_EmptySelName] For mappedBetType '${mappedBetType.name}' (ID: ${mappedBetType.id}) from oddID_key: ${oddData.oddID_key}. InternalKey: ${internalMarketKey}, Side: ${oddData.sideID}. Skipping.`);
            processingStats.emptySelectionNameSkipped++; continue;
          }

          const betToInsert = {
            game_id: currentGameId, bet_type_id: mappedBetType.id, selection_name: selectionName,
            odds: parseFloat(oddData.odds), line: lineValue, is_active: true,
            source_bookmaker: oddData.bookmakerID || bookmakerForFairOdds, // Fallback to queried bookmaker if oddData.bookmakerID is missing
            api_last_update: oddData.lastUpdate,
          };
          availableBetsToInsert.push(betToInsert);
        }
      } else {
        console.log(`[Info_NoOddsObject] No 'odds' object/data found or it's not an object for event ${event.eventID}. Skipping odds processing for this event.`);
      }

      if (availableBetsToInsert.length > 0) {
        const { error: insertError } = await supabaseAdmin
            .from('available_bets')
            .upsert(availableBetsToInsert, {
              onConflict: 'game_id,bet_type_id,selection_name,line',
              ignoreDuplicates: false,
            });
        if (insertError) {
          console.error(`[Error_DB_AvailableBetsUpsert] for game ${currentGameId} (${eventHomeTeamName} vs ${eventAwayTeamName}):`, insertError);
        } else {
          availableBetsInserted += availableBetsToInsert.length;
          console.log(`[Info] Upserted ${availableBetsToInsert.length} available_bets for game ${currentGameId} (${eventHomeTeamName} vs ${eventAwayTeamName}).`);
        }
      } else {
        console.log(`[Info] No new processable odds to insert/update for game ${currentGameId} (${eventHomeTeamName} vs ${eventAwayTeamName}).`);
      }
    } // End of events loop

    const summaryMessage = `Function fetch-sports-data complete. Events Processed: ${fetchedEvents.length}, Games Upserted: ${gamesUpserted}, AvailableBets Upserted: ${availableBetsInserted}. Stats: MainMarkets=${processingStats.mainMarketsProcessed}, PeriodMarkets=${processingStats.periodMarketsProcessed}, PlayerMarkets=${processingStats.playerMarketsProcessed}, NoBetTypeMapSkipped=${processingStats.noBetTypeMappingSkipped}, EmptySelectionSkipped=${processingStats.emptySelectionNameSkipped}, UnknownFormatSkipped=${processingStats.unknownOddFormatSkipped}, NoOddsValueSkipped=${processingStats.noOddsValueSkipped}.`;
    console.log(`[Info_Summary] ${summaryMessage}`);

    return new Response(JSON.stringify({ success: true, message: summaryMessage, data: { gamesUpserted, availableBetsInserted, stats: processingStats } }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
    });
  } catch (error) {
    console.error('[FATAL_ERROR] In fetch-sports-data function:', error.message, error.stack ? error.stack : '(No stack trace)');
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500,
    });
  }
});