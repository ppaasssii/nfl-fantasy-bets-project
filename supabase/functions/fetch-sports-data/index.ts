// supabase/functions/fetch-sports-data/index.ts
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

// --- Type Definitions (Remain the same) ---
interface ApiEventTeamDetails { statEntityID: string; score?: number; names: { short: string; medium: string; long: string }; teamID: string; }
interface ApiEventTeams { home: ApiEventTeamDetails; away: ApiEventTeamDetails; }
interface ApiEventStatus { startsAt: string; started: boolean; completed: boolean; cancelled: boolean; finalized: boolean; live: boolean; displayShort?: string; displayLong?: string; }
interface ApiBookmakerOddDetail { /* Not directly used if we only use fair odds, but keep for type completeness */
  bookmakerID: string; odds: string; overUnder?: string; spread?: string; available: boolean; isMainLine?: boolean; lastUpdatedAt: string;
}
interface ApiOddData {
  oddID: string; opposingOddID?: string; marketName: string; statID: string; statEntityID: string;
  periodID: string; betTypeID: string; sideID?: string; playerID?: string;
  byBookmaker?: Record<string, ApiBookmakerOddDetail>; // Still part of API response structure
  fairOdds?: string; fairOverUnder?: string; fairSpread?: string;
  bookOdds?: string; bookOverUnder?: string; bookSpread?: string; // Top-level consensus bookie odds
}
interface ApiEventResultsPeriod { [statEntityID: string]: { [statID: string]: number | string; }; }
interface ApiEventResults { [periodID: string]: ApiEventResultsPeriod; }
interface ApiPlayer {
  playerID: string; name: string; teamID: string; alias?: string;
  firstName?: string; lastName?: string; nickname?: string; position?: string;
}
interface ApiEvent {
  eventID: string; sportID: string; leagueID?: string; type: "match" | "prop" | "tournament";
  info?: Record<string, any>; players?: Record<string, ApiPlayer>; teams: ApiEventTeams;
  status: ApiEventStatus; odds?: Record<string, ApiOddData>; results?: ApiEventResults;
}
interface BetType { id: number; name: string; api_market_key: string; }

console.log('fetch-sports-data function booting up (V2 API - NFL Focus - v4.3 - Fair Odds Only)');

function americanToDecimal(americanOdds: number): number | null {
  if (isNaN(americanOdds)) return null;
  if (americanOdds > 0) return (americanOdds / 100) + 1;
  if (americanOdds < 0) return (100 / Math.abs(americanOdds)) + 1;
  return null;
}

function formatStatNameForDisplay(statID: string): string {
  const nameMap: Record<string, string> = {
    'points': 'Points', 'passing_yards': 'Passing Yds', 'rushing_yards': 'Rushing Yds',
    'receiving_yards': 'Receiving Yds', 'touchdowns': 'Anytime TD', 'defense_sacks': 'Sacks',
    'passing_touchdowns': 'Passing TDs', 'rushing_touchdowns': 'Rushing TDs', 'receiving_touchdowns': 'Receiving TDs',
    'receiving_receptions': 'Receptions',
    'passing_interceptions': 'INTs Thrown (QB)',
    'defense_interceptions': 'INTs Made (Defense)',
    'passing_completions': 'Pass Completions', 'passing_attempts': 'Pass Attempts',
    'passing_longestCompletion': 'Longest Completion', 'rushing_longestRush': 'Longest Rush',
    'receiving_longestReception': 'Longest Reception', 'defense_combinedTackles': 'Combined Tackles',
    'kicking_totalPoints': 'Kicker Pts', 'fieldGoals_made': 'FGs Made',
    'extraPoints_kicksMade': 'XPs Made', 'rushing+receiving_yards': 'Rush+Rec Yds',
    'passing+rushing_yards': 'Pass+Rush Yds',
    'firstTouchdown': 'First TD', 'lastTouchdown': 'Last TD', 'rushing_attempts': 'Rushing Attempts',
  };
  return nameMap[statID] || statID.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') { return new Response('ok', { headers: corsHeaders }); }
  try {
    const SPORTS_GAME_ODDS_API_KEY = Deno.env.get('SPORTS_GAME_ODDS_API_KEY');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');

    if (!SPORTS_GAME_ODDS_API_KEY || !SUPABASE_SERVICE_ROLE_KEY || !supabaseUrl) {
      throw new Error('Missing critical environment variables/secrets');
    }
    const supabaseAdmin: SupabaseClient = createClient(supabaseUrl, SUPABASE_SERVICE_ROLE_KEY);
    console.log('Supabase admin client initialized.');

    const { data: betTypesFromDB, error: betTypesError } = await supabaseAdmin.from('bet_types').select('id, api_market_key, name');
    if (betTypesError) throw betTypesError;
    if (!betTypesFromDB || betTypesFromDB.length === 0) throw new Error('No bet types found in DB. Please ensure bet_types table is populated.');

    const betTypeMapping = new Map<string, BetType>();
    betTypesFromDB.forEach(bt => betTypeMapping.set(bt.api_market_key, bt as BetType));
    console.log(`Bet types fetched and mapped (count): ${betTypeMapping.size}`);

    const sportIdentifierForAPI = 'FOOTBALL';
    const leagueIdentifierForAPI = 'NFL';
    // bookmakerID might still be required by API, even if we don't use its specific odds
    const bookmakerIDForAPIQuery = 'draftkings';
    const commonHeaders = { 'x-api-key': SPORTS_GAME_ODDS_API_KEY };
    const processingStats = {
      eventsReceived: 0, gamesUpserted: 0, oddsProcessed: 0, playerPropsProcessed: 0,
      mainMarketsProcessed: 0, periodMarketsProcessed: 0, teamPropsProcessed: 0,
      oddsEventsFailed: 0, availableBetsInserted: 0, timeBasedStatusUpdates: 0,
      oddsSkippedNoFairOdds: 0
    };

    const eventParams = new URLSearchParams({
      sportID: sportIdentifierForAPI,
      leagueID: leagueIdentifierForAPI,
      bookmakerID: bookmakerIDForAPIQuery,
      limit: "10"
    });

    const testStartsAfter = '2024-10-01T00:00:00Z';
    const testStartsBefore = '2024-10-07T00:00:00Z';
    eventParams.set('startsAfter', testStartsAfter);
    eventParams.set('startsBefore', testStartsBefore);
    console.log(`--- TESTING WITH USER-PROVIDED DATES (Oct 2024 Range) ---`);

    console.log(`Fetching ${leagueIdentifierForAPI} events between: ${eventParams.get('startsAfter')} and ${eventParams.get('startsBefore')} with limit ${eventParams.get('limit')}`);
    const eventsApiUrl = `https://api.sportsgameodds.com/v2/events/?${eventParams.toString()}`;
    console.log(`Fetching events from V2 API: ${eventsApiUrl}`);

    let apiEventsData: { success?: boolean; data?: ApiEvent[]; error?: string } = {};
    // ... (API fetch logic - same as before) ...
    try {
      const eventsResponse = await fetch(eventsApiUrl, { headers: commonHeaders });
      console.log(`V2 Events API response status: ${eventsResponse.status}`);
      const responseText = await eventsResponse.text();
      if (!eventsResponse.ok) {
        let errorDetail = responseText; try { const p = JSON.parse(responseText); if (p.error) errorDetail = p.error; else if (p.message) errorDetail = p.message; } catch (e) { }
        console.error(`SportsGameOdds V2 API (events) error: ${eventsResponse.status}`, errorDetail);
        processingStats.oddsEventsFailed = -1; apiEventsData.data = [];
      } else {
        apiEventsData = JSON.parse(responseText);
        if (!apiEventsData.success || !Array.isArray(apiEventsData.data)) {
          console.warn("V2 Events API response not successful or data not array. Response:", apiEventsData);
          apiEventsData.data = [];
        }
      }
    } catch (e) {
      console.error("Network/parsing error fetching events:", e.message);
      processingStats.oddsEventsFailed = -2; apiEventsData.data = [];
    }
    const receivedEvents = apiEventsData.data || [];
    processingStats.eventsReceived = receivedEvents.length;
    console.log(`Received ${receivedEvents.length} NFL event(s) from V2 API.`);


    for (const apiEvent of receivedEvents) {
      // ... (game upsert logic - same as before, ensure api_results_data is included) ...
      if (apiEvent.type !== 'match' || !apiEvent.teams?.home?.names || !apiEvent.teams?.away?.names) {
        console.warn(`Skipping event ${apiEvent.eventID || 'N/A'} - not a match or missing team names.`);
        continue;
      }
      try {
        const homeTeamName = apiEvent.teams.home.names.long || apiEvent.teams.home.names.medium || apiEvent.teams.home.teamID;
        const awayTeamName = apiEvent.teams.away.names.long || apiEvent.teams.away.names.medium || apiEvent.teams.away.teamID;

        const gameStatus = apiEvent.status.live ? 'live' : (apiEvent.status.completed ? 'completed' : 'scheduled');
        const homeScoreRaw = apiEvent.results?.[apiEvent.status.completed ? 'game' : 'live']?.home?.points;
        const awayScoreRaw = apiEvent.results?.[apiEvent.status.completed ? 'game' : 'live']?.away?.points;
        const homeScore = homeScoreRaw !== undefined ? parseInt(homeScoreRaw.toString(), 10) : null;
        const awayScore = awayScoreRaw !== undefined ? parseInt(awayScoreRaw.toString(), 10) : null;

        const { data: game, error: gameUpsertError } = await supabaseAdmin
            .from('games').upsert({
              api_game_id: apiEvent.eventID, home_team: homeTeamName, away_team: awayTeamName,
              game_time: apiEvent.status.startsAt, status: gameStatus,
              home_score: (homeScore !== null && !isNaN(homeScore)) ? homeScore : null,
              away_score: (awayScore !== null && !isNaN(awayScore)) ? awayScore : null,
              last_odds_update: apiEvent.odds && Object.keys(apiEvent.odds).length > 0 ? new Date().toISOString() : null,
              last_score_update: apiEvent.results ? new Date().toISOString() : null,
              api_results_data: apiEvent.results || null,
            }, { onConflict: 'api_game_id' }).select('id').single();

        if (gameUpsertError || !game) {
          console.error(`Error upserting game ${apiEvent.eventID} or no game data returned:`, gameUpsertError?.message);
          processingStats.oddsEventsFailed++; continue;
        }
        processingStats.gamesUpserted++;
        const internalGameId = game.id;

        if (apiEvent.odds && Object.keys(apiEvent.odds).length > 0) {
          await supabaseAdmin.from('available_bets').update({ is_active: false }).eq('game_id', internalGameId).eq('is_active', true);
          const newAvailableBetsToInsert = [];
          const playersMap = apiEvent.players || {};

          for (const oddID_key in apiEvent.odds) {
            processingStats.oddsProcessed++;
            const oddData = apiEvent.odds[oddID_key];

            // --- Use Fair Odds or top-level Book Odds as primary source ---
            const currentOddsValue = oddData.fairOdds || oddData.bookOdds;
            const currentOverUnder = oddData.fairOverUnder || oddData.bookOverUnder;
            const currentSpread = oddData.fairSpread || oddData.bookSpread;

            if (!currentOddsValue) { // If no fairOdds or top-level bookOdds string, skip
              console.log(`[DEBUG V4.3] Skipping ${oddID_key} - no fairOdds or bookOdds string available.`);
              processingStats.oddsSkippedNoFairOdds++;
              continue;
            }

            let mappedBetType: BetType | undefined = undefined;
            let selectionName = "";
            let line: number | null = null;
            let internalMarketKey = "";

            // --- Player Props ---
            if (oddData.playerID && oddData.statEntityID === oddData.playerID && playersMap[oddData.playerID]) {
              const player = playersMap[oddData.playerID];
              const playerName = player.name || `${player.firstName} ${player.lastName}` || `Player ${oddData.playerID}`;
              const statDisplayName = formatStatNameForDisplay(oddData.statID);

              if (oddData.statID === 'points' && (player.position === 'K' || playerName.toLowerCase().includes('kicker'))) {
                internalMarketKey = `player_kicking_totalPoints_${oddData.betTypeID}`;
              } else {
                internalMarketKey = `player_${oddData.statID}_${oddData.betTypeID}`;
              }
              mappedBetType = betTypeMapping.get(internalMarketKey);

              if (mappedBetType) {
                if (oddData.betTypeID === 'ou' && currentOverUnder) {
                  line = parseFloat(currentOverUnder);
                  selectionName = `${playerName} ${statDisplayName} ${oddData.sideID === 'over' ? 'Over' : 'Under'} ${line.toFixed(1)}`;
                } else if (oddData.betTypeID === 'yn') {
                  selectionName = `${playerName} ${statDisplayName} ${oddData.sideID === 'yes' ? 'Yes' : 'No'}`;
                } else {
                  console.warn(`[Player Prop DEBUG] Unclear naming for ${playerName}, stat: ${oddData.statID}, betType: ${oddData.betTypeID}, oddID: ${oddID_key}`);
                  continue;
                }
                processingStats.playerPropsProcessed++;
              }
            }
            // --- Team & Game Period Props ---
            else if (oddData.periodID && !['game', 'reg'].includes(oddData.periodID) && (oddData.statEntityID === 'home' || oddData.statEntityID === 'away' || oddData.statEntityID === 'all')) {
              const periodKeyPart = oddData.periodID;
              if (oddData.statEntityID === 'home' || oddData.statEntityID === 'away') {
                if (oddData.betTypeID === 'ou') {
                  internalMarketKey = `${periodKeyPart}_team_points_${oddData.statEntityID}_ou`;
                } else if (oddData.betTypeID === 'ml') {
                  internalMarketKey = `${periodKeyPart}_ml`;
                } else if (oddData.betTypeID === 'sp'){
                  internalMarketKey = `${periodKeyPart}_sp`;
                } else if (oddData.betTypeID === 'eo') {
                  internalMarketKey = `${periodKeyPart}_team_points_${oddData.statEntityID}_eo`;
                }
              } else if (oddData.statEntityID === 'all') {
                if (oddData.betTypeID === 'ou') {
                  internalMarketKey = `${periodKeyPart}_totals_ou`;
                } else if (oddData.betTypeID === 'eo') {
                  internalMarketKey = `${periodKeyPart}_total_eo`;
                }
              }
              mappedBetType = betTypeMapping.get(internalMarketKey);
              if(mappedBetType) {
                const periodName = periodKeyPart.toUpperCase();
                if (oddData.betTypeID === 'ou' && currentOverUnder) {
                  line = parseFloat(currentOverUnder);
                  const teamTarget = (oddData.statEntityID === 'home' || oddData.statEntityID === 'away') ?
                      (oddData.statEntityID === 'home' ? homeTeamName : awayTeamName) + " Pts" : "Total Pts";
                  selectionName = `${periodName} ${teamTarget} ${oddData.sideID === 'over' ? 'O' : 'U'} ${line.toFixed(1)}`;
                } else if (oddData.betTypeID === 'ml' && (oddData.statEntityID === 'home' || oddData.statEntityID === 'away')) {
                  selectionName = `${periodName} ${oddData.statEntityID === 'home' ? homeTeamName : awayTeamName}`;
                } else if (oddData.betTypeID === 'sp' && currentSpread && (oddData.statEntityID === 'home' || oddData.statEntityID === 'away')) {
                  line = parseFloat(currentSpread);
                  selectionName = `${periodName} ${oddData.statEntityID === 'home' ? homeTeamName : awayTeamName} ${line > 0 ? '+' : ''}${line.toFixed(1)}`;
                } else if (oddData.betTypeID === 'eo') {
                  const teamTarget = (oddData.statEntityID === 'home' || oddData.statEntityID === 'away') ?
                      (oddData.statEntityID === 'home' ? homeTeamName : awayTeamName) + " Pts" : "Total Pts";
                  selectionName = `${periodName} ${teamTarget} ${oddData.sideID === 'even' ? 'Even' : 'Odd'}`;
                }
                if (oddData.statEntityID === 'home' || oddData.statEntityID === 'away') processingStats.teamPropsProcessed++;
                else processingStats.periodMarketsProcessed++;
              }
            }
            // --- Main Game Markets ---
            else if (oddData.periodID === 'game' || oddData.periodID === 'reg') {
              if (oddData.betTypeID === 'ml' && (oddData.statEntityID === 'home' || oddData.statEntityID === 'away')) {
                internalMarketKey = 'h2h';
              } else if (oddData.betTypeID === 'sp' && (oddData.statEntityID === 'home' || oddData.statEntityID === 'away')) {
                internalMarketKey = 'spreads';
              } else if (oddData.betTypeID === 'ou' && oddData.statEntityID === 'all') {
                internalMarketKey = 'totals';
              } else if (oddData.betTypeID === 'ou' && (oddData.statEntityID === 'home' || oddData.statEntityID === 'away')) {
                internalMarketKey = `team_points_${oddData.statEntityID}_ou`;
              } else if (oddData.betTypeID === 'eo' && oddData.statEntityID === 'all') {
                internalMarketKey = 'game_total_eo';
              } else if (oddData.betTypeID === 'eo' && (oddData.statEntityID === 'home' || oddData.statEntityID === 'away')) {
                internalMarketKey = `team_points_${oddData.statEntityID}_eo`;
              } else if (oddData.betTypeID === 'ml3way' && oddData.periodID === 'reg') {
                internalMarketKey = 'reg_ml3way';
              }

              mappedBetType = betTypeMapping.get(internalMarketKey);
              if(mappedBetType) {
                if (internalMarketKey === 'h2h') {
                  if (oddData.statEntityID === 'home') selectionName = homeTeamName;
                  else if (oddData.statEntityID === 'away') selectionName = awayTeamName;
                } else if (internalMarketKey === 'spreads' && currentSpread) {
                  line = parseFloat(currentSpread);
                  if (oddData.statEntityID === 'home') selectionName = `${homeTeamName} ${line > 0 ? '+' : ''}${line.toFixed(1)}`;
                  else if (oddData.statEntityID === 'away') selectionName = `${awayTeamName} ${line > 0 ? '+' : ''}${line.toFixed(1)}`;
                } else if (internalMarketKey === 'totals' && currentOverUnder) {
                  line = parseFloat(currentOverUnder);
                  selectionName = `Total ${oddData.sideID === 'over' ? 'Over' : 'Under'} ${line.toFixed(1)}`;
                } else if (internalMarketKey === `team_points_home_ou` || internalMarketKey === `team_points_away_ou`) {
                  if (currentOverUnder) {
                    line = parseFloat(currentOverUnder);
                    selectionName = `${oddData.statEntityID === 'home' ? homeTeamName : awayTeamName} Pts ${oddData.sideID === 'over' ? 'O' : 'U'} ${line.toFixed(1)}`;
                  }
                } else if (internalMarketKey === 'game_total_eo') {
                  selectionName = `Total Points ${oddData.sideID === 'even' ? 'Even' : 'Odd'}`;
                } else if (internalMarketKey === `team_points_home_eo` || internalMarketKey === `team_points_away_eo`) {
                  selectionName = `${oddData.statEntityID === 'home' ? homeTeamName : awayTeamName} Points ${oddData.sideID === 'even' ? 'Even' : 'Odd'}`;
                } else if (internalMarketKey === 'reg_ml3way') {
                  if (oddData.sideID === 'home') selectionName = `${homeTeamName} (3-Way)`;
                  else if (oddData.sideID === 'away') selectionName = `${awayTeamName} (3-Way)`;
                  else if (oddData.sideID === 'draw') selectionName = 'Draw (3-Way)';
                  // Note: 'home+draw' or 'away+draw' as sideID for ml3way is unusual.
                  // If API uses this, it's more like a "Double Chance" market, which would need its own bet_type.
                  // For now, only handling explicit home/away/draw sides for ml3way.
                }
                processingStats.mainMarketsProcessed++;
              }
            }

            if (!mappedBetType) {
              console.log(`[DEBUG V4.3] No BetType mapping for internalMarketKey: '${internalMarketKey}' (API oddID_key: ${oddID_key}, Details: S:${oddData.statID}, BT:${oddData.betTypeID}, P:${oddData.periodID}, E:${oddData.statEntityID}, Side:${oddData.sideID})`);
              continue;
            }
            if (!selectionName && mappedBetType) {
              console.warn(`[DEBUG V4.3] SelectionName is empty for mappedBetType '${mappedBetType.name}' from oddID_key: ${oddID_key}. This indicates a logic gap for this combination.`);
              continue;
            }

            const americanOddsVal = parseFloat(currentOddsValue); // Use currentOddsValue
            const decimalPrice = americanToDecimal(americanOddsVal);

            if (decimalPrice !== null) {
              newAvailableBetsToInsert.push({
                game_id: internalGameId,
                bet_type_id: mappedBetType.id,
                selection_name: selectionName,
                odds: parseFloat(decimalPrice.toFixed(2)),
                line: line !== null && !isNaN(line) ? line : null,
                is_active: true,
                source_bookmaker: "fair_market_value", // Indicate using fair/consensus odds
                api_last_update: new Date().toISOString(), // Using current time as last update for these
              });
            } else {
              console.warn(`[DEBUG V4.3] Could not convert American odds: '${currentOddsValue}' (type: ${typeof currentOddsValue}) for ${oddID_key}`);
            }
          }

          if (newAvailableBetsToInsert.length > 0) {
            const { error: insertError, count } = await supabaseAdmin.from('available_bets').insert(newAvailableBetsToInsert).select('*', { count: 'exact' });
            if (insertError) {
              console.error(`Error inserting available_bets for game ${internalGameId} (${apiEvent.eventID}):`, insertError.message);
            } else {
              console.log(`Inserted ${count || 0} new available_bets for game ${internalGameId} (${apiEvent.eventID}). Using fair/consensus odds.`);
              processingStats.availableBetsInserted += (count || 0);
            }
          }
        } else {
          console.log(`No odds object or empty odds for event ${apiEvent.eventID}. Skipping odds processing.`);
        }
      } catch (innerError) {
        console.error(`Critical error processing event ${apiEvent.eventID}: ${innerError.message}`, innerError.stack);
        processingStats.oddsEventsFailed++;
      }
    }
    console.log('Finished processing events loop.');

    // ... (time-based status update - same as before)
    const now = new Date().toISOString();
    try {
      const { data: updatedGamesByTime, error: timeUpdateError } = await supabaseAdmin
          .from('games').update({ status: 'live', last_score_update: now })
          .eq('status', 'scheduled').lt('game_time', now).select('id');

      if (timeUpdateError) console.error('Error in time-based status update:', timeUpdateError.message);
      else if (updatedGamesByTime && updatedGamesByTime.length > 0) {
        processingStats.timeBasedStatusUpdates = updatedGamesByTime.length;
        console.log(`Time-based: ${updatedGamesByTime.length} games moved to 'live'.`);
      }
    } catch (timeUpdateCatchError) {
      console.error('Caught error during time-based status update:', timeUpdateCatchError.message);
    }

    console.log('Function fetch-sports-data complete.');
    return new Response(JSON.stringify({ message: 'NFL sports data processing attempt complete (Fair Odds Only).', stats: processingStats }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });

  } catch (error) {
    console.error('Critical error in fetch-sports-data (NFL v4.3 - Fair Odds Only):', error.message, error.stack);
    return new Response(JSON.stringify({ error: error.message || "Unknown critical error" }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
  }
});