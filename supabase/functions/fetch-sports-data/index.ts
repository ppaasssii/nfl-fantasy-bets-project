// File: supabase/functions/fetch-sports-data/index.ts

import { serve } from 'std/http/server.ts';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { corsHeaders } from 'shared/cors.ts';

const FUNCTION_VERSION = 'v5.1.2 - Full Logic, Scores, Opt AutoBetType';

console.log(`[Info] fetch-sports-data function booting up (${FUNCTION_VERSION})`);

// --- Type Definitions (Based on sample and prior versions) ---
interface StatusObject {
  hardStart?: boolean; delayed?: boolean; cancelled?: boolean; startsAt?: string;
  started?: boolean; displayShort?: string; completed?: boolean; displayLong?: string;
  ended?: boolean; live?: boolean; finalized?: boolean; currentPeriodID?: string;
  previousPeriodID?: string; oddsPresent?: boolean; oddsAvailable?: boolean;
  periods?: { ended?: string[], started?: string[] };
}
interface BookmakerOddDetail {
  odds: string; line?: string; overUnder?: string; spread?: string; lastUpdatedAt?: string;
}
interface OddData {
  oddID: string; opposingOddID?: string; marketName?: string; statID?: string;
  statEntityID?: string; periodID?: string; betTypeID?: string; sideID?: string; playerID?: string;
  fairOdds?: string; fairOverUnder?: string; fairSpread?: string;
  bookOdds?: string; bookOverUnder?: string; bookSpread?: string;
  score?: number; scoringSupported?: boolean; started?: boolean; ended?: boolean; cancelled?: boolean;
  lastUpdate?: string; byBookmaker?: Record<string, BookmakerOddDetail>;
}
interface EventInfo { seasonWeek?: string; }
interface PlayerDetail {
  playerID: string; name: string; teamID: string; alias?: string;
  firstName?: string; lastName?: string; nickname?: string;
}
interface EventTeamNameDetails { short: string; medium: string; long: string; }
interface EventTeamColors {
  secondary?: string; primaryContrast?: string; secondaryContrast?: string; primary?: string;
}
interface EventTeamDataStructure {
  statEntityID: string; names: EventTeamNameDetails; teamID: string;
  colors?: EventTeamColors; score?: number;
}
interface EventTeams { home: EventTeamDataStructure; away: EventTeamDataStructure; }
interface EventData {
  eventID: string; sportID: string; leagueID: string; type?: string; info?: EventInfo;
  players?: Record<string, PlayerDetail>; startsAt: string; status: StatusObject;
  teams?: EventTeams; homeTeamName?: string; awayTeamName?: string;
  odds: Record<string, OddData>; lastUpdate: string; results?: any;
}
interface V2ApiResponseDataField { events?: EventData[]; nextCursor?: string; }
interface V2ApiResponse {
  success: boolean; message?: string; data?: EventData[] | V2ApiResponseDataField; error?: string;
}
interface BetTypeRecord { id: number; name: string; api_market_key: string; description?: string; }
// --- End Type Definitions ---

function getSupabaseAdminClient(): SupabaseClient {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    const errorMsg = 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars.';
    console.error(`[Error_Critical] ${errorMsg}`);
    throw new Error(errorMsg);
  }
  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  console.log(`[Info] Received ${req.method} request.`);

  try {
    const supabaseAdmin = getSupabaseAdminClient();
    console.log('[Info] Supabase client init.');

    const { data: betTypesData, error: betTypesError } = await supabaseAdmin
        .from('bet_types').select('id, name, api_market_key, description');
    if (betTypesError) throw betTypesError;
    if (!betTypesData) throw new Error('No bet types from DB.');

    const betTypeMapping = new Map<string, BetTypeRecord>();
    betTypesData.forEach(bt => betTypeMapping.set(bt.api_market_key, bt as BetTypeRecord));
    console.log(`[Info] ${betTypeMapping.size} bet types mapped.`);
    const newMarketKeys = new Set<string>(); // For optional auto-bet-type creation

    const SPORTS_GAME_ODDS_API_KEY = Deno.env.get('SPORTS_GAME_ODDS_API_KEY');
    if (!SPORTS_GAME_ODDS_API_KEY) throw new Error('SPORTS_GAME_ODDS_API_KEY env var missing.');

    const requestUrl = new URL(req.url);
    const queryParams = requestUrl.searchParams;
    const sportID = queryParams.get('sportID') || 'FOOTBALL';
    const leagueID = queryParams.get('leagueID') || 'NFL';
    const bookmakerID = (queryParams.get('bookmakerID') || 'draftkings').toLowerCase();
    const limit = queryParams.get('limit') || "5"; // Keep limit low for testing initially
    let startsAfter = queryParams.get('startsAfter');
    let startsBefore = queryParams.get('startsBefore');
    if (!startsAfter || !startsBefore) {
      const today = new Date(); const sevenDays = new Date(new Date().setDate(today.getDate() + 7));
      startsAfter = today.toISOString().split('T')[0] + 'T00:00:00Z';
      startsBefore = sevenDays.toISOString().split('T')[0] + 'T23:59:59Z';
      console.log(`[Info] Defaulting date range: ${startsAfter} to ${startsBefore}`);
    } else {
      console.log(`[Info] Using date range: ${startsAfter} to ${startsBefore}`);
    }
    const eventApiParams = new URLSearchParams({ sportID, leagueID, bookmakerID, limit, startsAfter, startsBefore });
    const eventsApiUrl = `https://api.sportsgameodds.com/v2/events/?${eventApiParams.toString()}`;
    console.log(`[Info] Fetching: ${eventsApiUrl}`);

    const eventsResponse = await fetch(eventsApiUrl, {
      headers: { 'X-Api-Key': SPORTS_GAME_ODDS_API_KEY, 'Accept': 'application/json' },
    });
    console.log(`[Info] API Status: ${eventsResponse.status}`);
    if (!eventsResponse.ok) {
      const errBody = await eventsResponse.text(); throw new Error(`API Fetch Fail: ${errBody}`);
    }

    const eventsResult = (await eventsResponse.json()) as V2ApiResponse;
    let fetchedEvents: EventData[] = [];
    if (eventsResult.success && eventsResult.data) {
      if (Array.isArray(eventsResult.data)) fetchedEvents = eventsResult.data;
      else if (eventsResult.data.events) fetchedEvents = eventsResult.data.events;
      if (!Array.isArray(eventsResult.data) && eventsResult.data.nextCursor) console.log(`[Info] NextCursor: ${eventsResult.data.nextCursor}.`);
    } else if (!eventsResult.success) throw new Error(eventsResult.message || eventsResult.error || 'API success=false.');

    console.log(`[Info] Received ${fetchedEvents.length} events.`);
    if (fetchedEvents.length === 0) {
      return new Response(JSON.stringify({ success: true, message: 'No events.', data: { gamesUpserted: 0, availableBetsUpserted: 0, stats: {} } }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
    }

    let gamesUpsertedCount = 0; let availableBetsUpsertedCount = 0;
    const stats = { eventsProcessed: 0, oddsObjectsProcessed: 0, oddsSuccessfullyProcessed: 0, mainGameMarketsProcessed: 0, periodSpecificMarketsProcessed: 0, playerPropsProcessed: 0, skipped_NoOddsValue: 0, skipped_InvalidOddValue: 0, skipped_UnknownOddFormat: 0, skipped_NoBetTypeMapping: 0, skipped_EmptySelectionName: 0 };

    for (const event of fetchedEvents) {
      stats.eventsProcessed++;
      const gameStatus = event.status?.displayLong?.toLowerCase() || event.status?.displayShort?.toLowerCase() || 'unknown';
      const homeTeamName = event.teams?.home?.names?.long || event.teams?.home?.names?.medium || event.homeTeamName || 'Unknown Home';
      const awayTeamName = event.teams?.away?.names?.long || event.teams?.away?.names?.medium || event.awayTeamName || 'Unknown Away';
      console.log(`[Ev] ${event.eventID} (${awayTeamName} @ ${homeTeamName}), Status: ${gameStatus}`);

      const gameToUpsert = { api_game_id: event.eventID, home_team: homeTeamName, away_team: awayTeamName, game_time: event.startsAt || event.status?.startsAt || new Date(0).toISOString(), status: gameStatus, last_odds_update: new Date().toISOString() };
      const { data: gameData, error: gameError } = await supabaseAdmin.from('games').upsert(gameToUpsert, { onConflict: 'api_game_id' }).select('id, home_team, away_team').single();
      if (gameError) { console.error(`[Err_GameUpsert] ${event.eventID}:`, gameError); continue; }
      if (!gameData) { console.error(`[Err_GameUpsertRet] No data ${event.eventID}.`); continue; }
      gamesUpsertedCount++; const gameId = gameData.id; const confHome = gameData.home_team; const confAway = gameData.away_team;

      const homeScore = event.results?.game?.home?.points;
      const awayScore = event.results?.game?.away?.points;
      if (homeScore !== undefined && awayScore !== undefined) {
        const { error: scoreUpdErr } = await supabaseAdmin.from('games').update({ home_score: homeScore, away_score: awayScore, last_score_update: new Date().toISOString() }).eq('id', gameId);
        if (scoreUpdErr) console.warn(`[Warn_ScoreUpd] Game ${gameId}:`, scoreUpdErr);
        else console.log(`[Info] Scores for ${gameId}: H ${homeScore}, A ${awayScore}`);
      }

      const betsToIns = [];
      if (event.odds && typeof event.odds === 'object' && Object.keys(event.odds).length > 0) {
        stats.oddsObjectsProcessed++;
        for (const oddKey in event.odds) { // oddKey is the unique identifier string for the odd
          const odd: OddData = event.odds[oddKey];
          let selOddsStr: string | undefined, selLineStr: string | undefined;
          let bkDetail: BookmakerOddDetail | undefined = odd.byBookmaker?.[bookmakerID]; // Use the function-level bookmakerID for filtering

          if (bkDetail?.odds) { selOddsStr = bkDetail.odds; selLineStr = bkDetail.spread || bkDetail.line || bkDetail.overUnder; }
          else if (odd.bookOdds) { selOddsStr = odd.bookOdds; selLineStr = odd.bookSpread || odd.bookOverUnder; }
          else if (odd.fairOdds) { selOddsStr = odd.fairOdds; selLineStr = odd.fairSpread || odd.fairOverUnder; }

          if (!selOddsStr || selOddsStr.trim() === "") { stats.skipped_NoOddsValue++; continue; }
          let numOdds: number; try { numOdds = parseFloat(selOddsStr); } catch (e) { stats.skipped_InvalidOddValue++; console.warn(`[Warn_InvalidOddValue] OddKey: ${oddKey}, Value: '${selOddsStr}'`); continue; }
          let lineVal: number | undefined; if (selLineStr) { try { lineVal = parseFloat(selLineStr); if (isNaN(lineVal)) lineVal = undefined; } catch (e) { console.warn(`[Warn_InvalidLineValue] OddKey: ${oddKey}, Value: '${selLineStr}'`); lineVal = undefined; } }

          let intMKey: string | undefined, selName: string | undefined;
          let mapBetType: BetTypeRecord | undefined;
          const statEnt = odd.statEntityID?.toLowerCase(); const side = odd.sideID?.toLowerCase();
          const statApiN = odd.statID?.toLowerCase(); const betTypeApiA = odd.betTypeID?.toLowerCase();

          // A. Player Props
          if (statEnt && odd.playerID && !['home', 'away', 'all'].includes(statEnt) && event.players?.[odd.playerID]) {
            const pApiID = odd.playerID; const pInfo = event.players[pApiID];
            if (statApiN && betTypeApiA) {
              intMKey = `player_${statApiN}_${betTypeApiA}`;
              // if (intMKey && !betTypeMapping.has(intMKey)) newMarketKeys.add(intMKey); // Auto-add logic moved lower
              mapBetType = betTypeMapping.get(intMKey);
              if (mapBetType) {
                let pName = pInfo?.nickname || pInfo?.name || (pInfo?.firstName && pInfo?.lastName ? `${pInfo.firstName} ${pInfo.lastName}` : pApiID.replace(/_1_NFL$/, '').replace(/_/g, ' ')); // Improved fallback name
                const bBetName = mapBetType.name.replace(/^Player /i, '').replace(/ O\/U$/i,'').replace(/ Yes\/No$/i,'').replace(/\s*\(.*?\)\s*$/, '').trim(); // Remove (QB) or (DEF) for selectionName
                if (betTypeApiA === 'ou' && lineVal !== undefined) selName = `${pName} ${bBetName} ${side === 'over' ? 'Over' : 'Under'} ${lineVal}`;
                else if (betTypeApiA === 'yn') selName = `${pName} ${bBetName} ${side === 'yes' ? 'Yes' : 'No'}`;
                else selName = `${pName} ${bBetName} (${side})`;
                stats.playerPropsProcessed++;
              }
            }
          }
          // B. Period Specific Markets
          else if (['1h', '2h', '1q', '2q', '3q', '4q'].includes(odd.periodID || '')) {
            const pP = odd.periodID;
            if (betTypeApiA === 'ml') intMKey = `${pP}_ml`;
            else if (betTypeApiA === 'sp') intMKey = `${pP}_sp`;
            else if (betTypeApiA === 'ou' && statEnt === 'all') intMKey = `${pP}_totals_ou`;
            else if (betTypeApiA === 'ou' && statEnt === 'home') intMKey = `${pP}_team_points_home_ou`;
            else if (betTypeApiA === 'ou' && statEnt === 'away') intMKey = `${pP}_team_points_away_ou`;
            else if (betTypeApiA === 'eo' && statEnt === 'all') intMKey = `${pP}_total_eo`;
            else if (betTypeApiA === 'eo' && statEnt === 'home') intMKey = `${pP}_team_points_home_eo`;
            else if (betTypeApiA === 'eo' && statEnt === 'away') intMKey = `${pP}_team_points_away_eo`;
            // if (intMKey && !betTypeMapping.has(intMKey)) newMarketKeys.add(intMKey); // Auto-add logic moved lower
            mapBetType = betTypeMapping.get(intMKey || '');
            if (mapBetType && intMKey) {
              if (intMKey.endsWith('_ml')) selName = statEnt === 'home' ? confHome : confAway;
              else if (intMKey.endsWith('_sp')) selName = `${statEnt === 'home' ? confHome : confAway} ${lineVal !== undefined && lineVal > 0 ? '+' : ''}${lineVal}`;
              else if (intMKey.includes('_totals_ou') || intMKey.includes('_team_points')) {
                let tP = ''; if (intMKey.includes('home')) tP = `${confHome} `; else if (intMKey.includes('away')) tP = `${confAway} `;
                selName = `${tP}${side === 'over' ? 'Over' : 'Under'} ${lineVal}`;
              } else if (intMKey.endsWith('_eo')) selName = `${statEnt === 'home' ? confHome + " " : statEnt === 'away' ? confAway + " " : ""}Total ${side === 'even' ? 'Even' : 'Odd'}`;
              stats.periodSpecificMarketsProcessed++;
            }
          }
          // C. Main Game Markets
          else if (['game', 'reg', 'ft'].includes(odd.periodID || '') || !odd.periodID) {
            if (betTypeApiA === 'ml') intMKey = 'h2h'; else if (betTypeApiA === 'sp') intMKey = 'spreads';
            else if (betTypeApiA === 'ou' && statEnt === 'all') intMKey = 'totals';
            else if (betTypeApiA === 'ou' && statEnt === 'home') intMKey = 'team_points_home_ou';
            else if (betTypeApiA === 'ou' && statEnt === 'away') intMKey = 'team_points_away_ou';
            else if (betTypeApiA === 'eo' && statEnt === 'all') intMKey = 'game_total_eo';
            else if (betTypeApiA === 'eo' && statEnt === 'home') intMKey = 'team_points_home_eo';
            else if (betTypeApiA === 'eo' && statEnt === 'away') intMKey = 'team_points_away_eo';
            else if (betTypeApiA === 'ml3way' && (odd.periodID === 'reg'||odd.periodID === 'game')) {
              if (['home','away','draw'].includes(side||'')) intMKey='reg_ml3way';
              else if (side?.includes('+')||side==='not_draw') intMKey='reg_double_chance';
            }
            // if (intMKey && !betTypeMapping.has(intMKey)) newMarketKeys.add(intMKey); // Auto-add logic moved lower
            mapBetType = betTypeMapping.get(intMKey || '');
            if (mapBetType && intMKey) {
              if (intMKey === 'h2h') selName = statEnt === 'home' ? confHome : confAway;
              else if (intMKey === 'spreads') selName = `${statEnt === 'home' ? confHome : confAway} ${lineVal !== undefined && lineVal > 0 ? '+' : ''}${lineVal}`;
              else if (intMKey === 'totals') selName = `${side === 'over' ? 'Over' : 'Under'} ${lineVal}`;
              else if (intMKey === 'team_points_home_ou') selName = `${confHome} ${side === 'over' ? 'Over' : 'Under'} ${lineVal}`;
              else if (intMKey === 'team_points_away_ou') selName = `${confAway} ${side === 'over' ? 'Over' : 'Under'} ${lineVal}`;
              else if (intMKey.endsWith('_eo') && intMKey.startsWith('game')) selName = `Total ${side === 'even' ? 'Even' : 'Odd'}`;
              else if (intMKey.endsWith('_eo') && intMKey.startsWith('team')) selName = `${statEnt === 'home' ? confHome : confAway} Total ${side === 'even' ? 'Even' : 'Odd'}`;
              else if (intMKey === 'reg_ml3way') { if (side==='home') selName=confHome; else if (side==='away') selName=confAway; else if (side==='draw') selName='Draw';}
              else if (intMKey === 'reg_double_chance') { if(side==='home+draw')selName=`${confHome} or Draw`; else if(side==='away+draw')selName=`${confAway} or Draw`; else if(side==='not_draw')selName=`${confHome} or ${confAway}`;}
              stats.mainGameMarketsProcessed++;
            }
          } else { stats.skUF++; /* console.log(`[DEBUG_SkipUnknownFormat] Odd: ${odd.oddID}, Period: ${odd.periodID}, BetType: ${betTypeApiA}`); */ continue; }

          // Centralized check for missing bet type mapping and optional auto-add
          if (intMKey && !mapBetType) {
            if (!betTypeMapping.has(intMKey)) { // Check again to ensure it's truly not mapped
              console.log(`[DEBUG_NoBetTypeMapping] Key: '${intMKey}' for odd ${odd.oddID} (Market: ${odd.marketName || 'N/A'}) not in betTypeMapping.`);
              newMarketKeys.add(intMKey); // Collect for potential auto-insertion
            }
            stats.skipped_NoBetTypeMapping++; continue;
          }
          if (!mapBetType) { // Should not happen if above logic is sound, but as a safeguard
            stats.skipped_NoBetTypeMapping++; continue;
          }

          if (!selName || selName.trim() === '' || selName.includes('undefined') || selName.toLowerCase().includes('unknown home') || selName.toLowerCase().includes('unknown away')) {
            stats.skipped_EmptySelectionName++; console.warn(`[Warn_EmptySelName] Odd: ${odd.oddID}, Key: ${intMKey}, Gen: '${selName}'.`); continue;
          }
          betsToIns.push({ game_id: gameId, bet_type_id: mapBetType.id, selection_name: selName, odds: numOdds, line: lineVal, is_active: true, source_bookmaker: bookmakerID, api_last_update: bkDetail?.lastUpdatedAt || odd.lastUpdate || new Date().toISOString() });
          stats.oddsSuccessfullyProcessed++;
        }
      } else { console.log(`[Info_NoOddsData] ${event.eventID}`); }

      if (betsToIns.length > 0) {
        const { error: insBetErr } = await supabaseAdmin.from('available_bets').upsert(betsToIns, { onConflict: 'game_id,bet_type_id,selection_name,line' });
        if (insBetErr) console.error(`[Err_AvailBetUpsert] Game ${gameId}:`, insBetErr);
        else { availableBetsUpsertedCount += betsToIns.length; console.log(`[Info] Upserted ${betsToIns.length} bets for ${gameId}.`); }
      } else { console.log(`[Info] No new odds for ${gameId}.`); }
    }

    // --- Optional: Auto-insert missing bet_types (currently commented out) ---
    /*
    if (newMarketKeys.size > 0) {
        console.log(`[Info_AutoBetType] Found ${newMarketKeys.size} new market keys to potentially add:`, Array.from(newMarketKeys));
        const betTypesToAutoInsert = Array.from(newMarketKeys).map(key => ({
            api_market_key: key, name: `AUTO: ${key}`, description: `Auto-generated for key: ${key}. Please review and update.`
        }));
        const { data: autoInsertData, error: autoInsertErr } = await supabaseAdmin
            .from('bet_types')
            .insert(betTypesToAutoInsert)
            .select(); // To confirm insertion or get error details

        if (autoInsertErr) {
            console.error('[Error_DB_AutoInsertBetTypes] Failed to auto-insert new bet types:', autoInsertErr);
        } else {
            console.log(`[Info_AutoBetType] Successfully attempted to auto-insert ${betTypesToAutoInsert.length} new bet_types. Review DB and update names/descriptions. New types may require function re-run to be used.`);
            // For the current run to use these, you'd ideally re-fetch betTypeMapping here,
            // or accept they'll be used on the *next* run.
        }
    }
    */
    // --- End Optional Auto-insert ---

    const summary = `FN (${FUNCTION_VERSION}) done. EvF: ${fetchedEvents.length}, GU: ${gamesUpsertedCount}, BU: ${availableBetsUpsertedCount}.`;
    console.log(`[Summ] ${summary}`);
    console.log('[Summ_Stats] Detail:', JSON.stringify(stats, null, 2));
    return new Response(JSON.stringify({ success: true, message: summary, data: { gamesUpserted: gamesUpsertedCount, availableBetsUpserted: availableBetsUpsertedCount, stats } }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }});
  } catch (error) {
    console.error(`[FATAL] (${FUNCTION_VERSION}):`, error.message, error.stack);
    return new Response(JSON.stringify({ success: false, error: `Internal Error: ${error.message}` }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
  }
});