// File: supabase/functions/fetch-sports-data/index.ts

import { serve } from 'std/http/server.ts';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { corsHeaders } from 'shared/cors.ts';

const FUNCTION_VERSION = 'v5.1.5 - Refined American Odds Logic';

console.log(`[Info] fetch-sports-data function booting up (${FUNCTION_VERSION})`);

// --- Type Definitions (Should be consistent) ---
interface StatusObject{hardStart?:boolean;delayed?:boolean;cancelled?:boolean;startsAt?:string;started?:boolean;displayShort?:string;completed?:boolean;displayLong?:string;ended?:boolean;live?:boolean;finalized?:boolean;currentPeriodID?:string;previousPeriodID?:string;oddsPresent?:boolean;oddsAvailable?:boolean;periods?:{ended?:string[],started?:string[]};}
interface BookmakerOddDetail{odds:string;line?:string;overUnder?:string;spread?:string;lastUpdatedAt?:string;}
interface OddData{oddID:string;opposingOddID?:string;marketName?:string;statID?:string;statEntityID?:string;periodID?:string;betTypeID?:string;sideID?:string;playerID?:string;fairOdds?:string;fairOverUnder?:string;fairSpread?:string;bookOdds?:string;bookOverUnder?:string;bookSpread?:string;score?:number;scoringSupported?:boolean;started?:boolean;ended?:boolean;cancelled?:boolean;lastUpdate?:string;byBookmaker?:Record<string,BookmakerOddDetail>;}
interface EventInfo{seasonWeek?:string;}
interface PlayerDetail{playerID:string;name:string;teamID:string;alias?:string;firstName?:string;lastName?:string;nickname?:string;}
interface EventTeamNameDetails{short:string;medium:string;long:string;}
interface EventTeamColors{secondary?:string;primaryContrast?:string;secondaryContrast?:string;primary?:string;}
interface EventTeamDataStructure{statEntityID:string;names:EventTeamNameDetails;teamID:string;colors?:EventTeamColors;score?:number;}
interface EventTeams{home:EventTeamDataStructure;away:EventTeamDataStructure;}
interface EventData{eventID:string;sportID:string;leagueID:string;type?:string;info?:EventInfo;players?:Record<string,PlayerDetail>;startsAt:string;status:StatusObject;teams?:EventTeams;homeTeamName?:string;awayTeamName?:string;odds:Record<string,OddData>;lastUpdate:string;results?:any;}
interface V2ApiResponseDataField{events?:EventData[];nextCursor?:string;}
interface V2ApiResponse{success:boolean;message?:string;data?:EventData[]|V2ApiResponseDataField;error?:string;}
interface BetTypeRecord{id:number;name:string;api_market_key:string;description?:string;}
// --- End Type Definitions ---

function getSupabaseAdminClient():SupabaseClient{const su=Deno.env.get('SUPABASE_URL'),sk=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');if(!su||!sk){console.error(`[Crit] Missing SUPABASE_URL/SERVICE_KEY`);throw new Error('Server config err.');}return createClient(su,sk,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});}

// Stricter check for typical American odds values, filters out common API placeholders/extremes
function isPlausibleAmericanOdd(oddString?: string | null): boolean {
  if (!oddString || typeof oddString !== 'string') return false;
  try {
    const num = parseFloat(oddString);
    if (isNaN(num)) return false;
    // Standard American odds are >= +100 or <= -100.
    // Allow a small band around +/-100 for minor variations or vig.
    // This filters out things like -1, 0, +1, or small decimals NOT representing American odds.
    // Also filters out very extreme values that are likely placeholders.
    const isPositiveRange = num >= 100 && num <= 30000; // e.g. +100 to +30000
    const isNegativeRange = num <= -100 && num >= -30000; // e.g. -100 to -30000
    return isPositiveRange || isNegativeRange;
  } catch { return false; }
}
// Less strict, used for fallbacks if no "plausible" odd is found
function isPotentiallyUsableOdd(oddString?: string | null): boolean {
  if (!oddString || typeof oddString !== 'string') return false;
  try {
    const num = parseFloat(oddString);
    return !isNaN(num) && num !== 0 && num > -90000 && num < 90000; // Broader, but avoids the most extreme placeholders
  } catch { return false; }
}


serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  console.log(`[Info] Received ${req.method} request.`);

  try {
    const supabaseAdmin = getSupabaseAdminClient();
    const { data: betTypesData, error: betTypesError } = await supabaseAdmin.from('bet_types').select('*');
    if (betTypesError || !betTypesData) throw new Error('No bet types from DB or DB error.');
    const betTypeMapping = new Map(betTypesData.map(bt => [bt.api_market_key, bt as BetTypeRecord]));
    console.log(`[Info] ${betTypeMapping.size} bet types mapped.`);
    const newMarketKeys = new Set<string>();

    const SPORTS_GAME_ODDS_API_KEY = Deno.env.get('SPORTS_GAME_ODDS_API_KEY');
    if (!SPORTS_GAME_ODDS_API_KEY) throw new Error('SPORTS_GAME_ODDS_API_KEY missing.');

    const params = new URL(req.url).searchParams;
    const sportID = params.get('sportID') || 'FOOTBALL';
    const leagueID = params.get('leagueID') || 'NFL';
    const bookmakerFilterParam = params.get('bookmakerID')?.toLowerCase(); // Target specific bookmaker if passed
    const limit = params.get('limit') || "3";
    let startsAfter = params.get('startsAfter'); let startsBefore = params.get('startsBefore');
    if (!startsAfter || !startsBefore) { const t=new Date(), s=new Date(new Date().setDate(t.getDate()+7)); startsAfter=t.toISOString().split('T')[0]+'T00:00:00Z'; startsBefore=s.toISOString().split('T')[0]+'T23:59:59Z'; }

    const eventApiParamsObj: Record<string,string> = {sportID,leagueID,limit,startsAfter,startsBefore};
    // IMPORTANT: If bookmakerFilterParam is provided, we use it in the API call.
    // If NOT provided, the API will return odds from multiple bookmakers within byBookmaker.
    if (bookmakerFilterParam) eventApiParamsObj.bookmakerID = bookmakerFilterParam;

    const eventsApiUrl = `https://api.sportsgameodds.com/v2/events/?${new URLSearchParams(eventApiParamsObj).toString()}`;
    console.log(`[Info] Fetching: ${eventsApiUrl}`);

    const eventsResponse = await fetch(eventsApiUrl, { headers: { 'X-Api-Key':SPORTS_GAME_ODDS_API_KEY,'Accept':'application/json'}});
    console.log(`[Info] API Status: ${eventsResponse.status}`);
    if (!eventsResponse.ok) { const errBody = await eventsResponse.text(); throw new Error(`API Fail: ${errBody}`); }

    const eventsResult = await eventsResponse.json() as V2ApiResponse;
    let fetchedEvents: EventData[] = [];
    if (eventsResult.success && eventsResult.data) {
      if (Array.isArray(eventsResult.data)) fetchedEvents = eventsResult.data;
      else if (eventsResult.data.events) fetchedEvents = eventsResult.data.events;
    } else if (!eventsResult.success) throw new Error(eventsResult.message||eventsResult.error||'API no success.');
    console.log(`[Info] Received ${fetchedEvents.length} events.`);
    if (fetchedEvents.length === 0) return new Response(JSON.stringify({success:true,message:'No events.'}),{headers:corsHeaders});

    let gamesUpsertedCount = 0; let availableBetsUpsertedCount = 0;
    const stats = {evP:0,oddP:0,oddSucP:0,mS:0,pS:0,plS:0,skNV:0,skURO:0,skIVO:0,skUF:0,skNBM:0,skESN:0};

    for (const event of fetchedEvents) {
      stats.evP++;
      const gameStatus = event.status?.displayLong?.toLowerCase()||event.status?.displayShort?.toLowerCase()||'unknown';
      const homeTeamName=event.teams?.home?.names?.long||event.teams?.home?.names?.medium||event.homeTeamName||'Unknown Home';
      const awayTeamName=event.teams?.away?.names?.long||event.teams?.away?.names?.medium||event.awayTeamName||'Unknown Away';
      console.log(`[Ev] ${event.eventID} (${awayTeamName} @ ${homeTeamName}), Status: ${gameStatus}`);
      const gameToUpsert = {api_game_id:event.eventID,home_team:homeTeamName,away_team:awayTeamName,game_time:event.startsAt||event.status?.startsAt||new Date(0).toISOString(),status:gameStatus,last_odds_update:new Date().toISOString()};
      const {data:gameData,error:gameError}=await supabaseAdmin.from('games').upsert(gameToUpsert,{onConflict:'api_game_id'}).select('id,home_team,away_team').single();
      if(gameError||!gameData){console.error(`[Err_GameUpsert] ${event.eventID}:`,gameError);continue;}
      gamesUpsertedCount++; const gameId=gameData.id; const confHome=gameData.home_team; const confAway=gameData.away_team;

      const homeScore=event.results?.game?.home?.points; const awayScore=event.results?.game?.away?.points;
      if(homeScore!==undefined && awayScore!==undefined){const{error:scoreUpdErr}=await supabaseAdmin.from('games').update({home_score:homeScore,away_score:awayScore,last_score_update:new Date().toISOString()}).eq('id',gameId); if(scoreUpdErr)console.warn(`[Warn_ScoreUpd] Game ${gameId}:`,scoreUpdErr);}

      const betsToInsRaw = [];
      if(event.odds && typeof event.odds === 'object' && Object.keys(event.odds).length > 0){
        stats.oddP++;
        for (const oddKey in event.odds) {
          const odd: OddData = event.odds[oddKey];
          let selOddsStr: string | undefined, selLineStr: string | undefined;
          let srcOfOdds: string = "none_found_reasonable";

          const targetBkDetails = bookmakerFilterParam ? odd.byBookmaker?.[bookmakerFilterParam] : undefined;

          if (targetBkDetails?.odds && isPlausibleAmericanOdd(targetBkDetails.odds)) {
            selOddsStr = targetBkDetails.odds; selLineStr = targetBkDetails.spread || targetBkDetails.line || targetBkDetails.overUnder; srcOfOdds = `${bookmakerFilterParam}_specific`;
          } else if (odd.fairOdds && isPlausibleAmericanOdd(odd.fairOdds)) {
            selOddsStr = odd.fairOdds; selLineStr = odd.fairSpread || odd.fairOverUnder; srcOfOdds = "fairOdds";
          } else if (odd.bookOdds && isPlausibleAmericanOdd(odd.bookOdds)) { // Top-level bookOdds
            selOddsStr = odd.bookOdds; selLineStr = odd.bookSpread || odd.bookOverUnder; srcOfOdds = "bookOdds_top";
          } else if (odd.byBookmaker && !targetBkDetails) { // Iterate if no specific target OR target was not plausible
            const preferredFallbacks = ['draftkings', 'fanduel', 'betmgm', 'caesars', 'betrivers', 'pointsbet', 'betonline', 'bovada']; // Customize this
            for (const bk of preferredFallbacks) {
              if (odd.byBookmaker[bk]?.odds && isPlausibleAmericanOdd(odd.byBookmaker[bk].odds)) {
                selOddsStr = odd.byBookmaker[bk].odds; selLineStr = odd.byBookmaker[bk].spread || odd.byBookmaker[bk].line || odd.byBookmaker[bk].overUnder; srcOfOdds = `byBookmaker_${bk}`; break;
              }
            }
          }
          // Last resort: if still no plausible odd, check potentially usable ones from main fields
          if (!selOddsStr) {
            if (targetBkDetails?.odds && isPotentiallyUsableOdd(targetBkDetails.odds)) { selOddsStr = targetBkDetails.odds; selLineStr = targetBkDetails.spread || targetBkDetails.line || targetBkDetails.overUnder; srcOfOdds = `${bookmakerFilterParam}_specific_fallback`;}
            else if (odd.fairOdds && isPotentiallyUsableOdd(odd.fairOdds)) { selOddsStr = odd.fairOdds; selLineStr = odd.fairSpread || odd.fairOverUnder; srcOfOdds = "fairOdds_fallback"; }
            else if (odd.bookOdds && isPotentiallyUsableOdd(odd.bookOdds)) { selOddsStr = odd.bookOdds; selLineStr = odd.bookSpread || odd.bookOverUnder; srcOfOdds = "bookOdds_top_fallback";}

            if (!selOddsStr) { stats.skURO++; /* console.log(`[Skip_Unreasonable] Odd: ${odd.oddID}`); */ continue; }
            else { console.log(`[Warn_UsedFallbackOdd] Odd: ${odd.oddID}, Source: ${srcOfOdds}, Val: ${selOddsStr}`); }
          }

          let numOdds:number; try{numOdds=parseFloat(selOddsStr);}catch(e){stats.skIVO++;continue;}
          let lineVal:number|undefined; if(selLineStr){try{lineVal=parseFloat(selLineStr);if(isNaN(lineVal))lineVal=undefined;}catch(e){lineVal=undefined;}}

          let intMKey:string|undefined, selName:string|undefined; let mapBetType:BetTypeRecord|undefined;
          const statEnt=odd.statEntityID?.toLowerCase(), side=odd.sideID?.toLowerCase(), statApiN=odd.statID?.toLowerCase(), betTypeApiA=odd.betTypeID?.toLowerCase();

          if(statEnt&&odd.playerID&&!['home','away','all'].includes(statEnt)&&event.players?.[odd.playerID]){
            const pApiID=odd.playerID;const pInfo=event.players[pApiID]; if(statApiN&&betTypeApiA){intMKey=`player_${statApiN}_${betTypeApiA}`;mapBetType=betTypeMapping.get(intMKey);if(mapBetType){let pName=pInfo?.nickname||pInfo?.name||(pInfo?.firstName&&pInfo?.lastName?`${pInfo.firstName} ${pInfo.lastName}`:pApiID.replace(/_[\d]+_NFL$/,'').replace(/_/g,' '));const bBetName=mapBetType.name.replace(/^Player /i,'').replace(/ O\/U$/i,'').replace(/ Yes\/No$/i,'').replace(/\s*\(.*?\)\s*$/,'').trim();if(betTypeApiA==='ou'&&lineVal!==undefined)selName=`${pName} ${bBetName} ${side==='over'?'Over':'Under'} ${lineVal}`;else if(betTypeApiA==='yn')selName=`${pName} ${bBetName} ${side==='yes'?'Yes':'No'}`;else selName=`${pName} ${bBetName} (${side})`;stats.plS++;}}}
          else if(['1h','2h','1q','2q','3q','4q'].includes(odd.periodID||'')){const pP=odd.periodID;if(betTypeApiA==='ml')intMKey=`${pP}_ml`;else if(betTypeApiA==='sp')intMKey=`${pP}_sp`;else if(betTypeApiA==='ou'&&statEnt==='all')intMKey=`${pP}_totals_ou`;else if(betTypeApiA==='ou'&&statEnt==='home')intMKey=`${pP}_team_points_home_ou`;else if(betTypeApiA==='ou'&&statEnt==='away')intMKey=`${pP}_team_points_away_ou`;else if(betTypeApiA==='eo'&&statEnt==='all')intMKey=`${pP}_total_eo`;else if(betTypeApiA==='eo'&&statEnt==='home')intMKey=`${pP}_team_points_home_eo`;else if(betTypeApiA==='eo'&&statEnt==='away')intMKey=`${pP}_team_points_away_eo`;mapBetType=betTypeMapping.get(intMKey||'');if(mapBetType&&intMKey){if(intMKey.endsWith('_ml'))selName=statEnt==='home'?confHome:confAway;else if(intMKey.endsWith('_sp'))selName=`${statEnt==='home'?confHome:confAway} ${lineVal!==undefined&&lineVal>0?'+':''}${lineVal}`;else if(intMKey.includes('_totals_ou')||(intMKey.includes('_team_points')&&intMKey.endsWith('_ou'))){let tP='';if(intMKey.includes('home'))tP=`${confHome} `;else if(intMKey.includes('away'))tP=`${confAway} `;selName=`${tP}${side==='over'?'Over':'Under'} ${lineVal}`;}else if(intMKey.endsWith('_eo')){const teamPart=statEnt==='home'?`${confHome} `:statEnt==='away'?`${confAway} `:``;const periodDesc=mapBetType.name.match(/1st Half|2nd Half|1st Qtr|2nd Qtr|3rd Qtr|4th Qtr|Quarter|Half/i)?.[0]||'';selName=`${teamPart}${periodDesc?periodDesc+' ':''}Points ${side==='even'?'Even':'Odd'}`.trim().replace(/\s\s+/g,' ');if(!teamPart && !periodDesc) selName = `Total Points ${side==='even'?'Even':'Odd'}`;}stats.pS++;}}
          else if(['game','reg','ft'].includes(odd.periodID||'')||!odd.periodID){if(betTypeApiA==='ml')intMKey='h2h';else if(betTypeApiA==='sp')intMKey='spreads';else if(betTypeApiA==='ou'&&statEnt==='all')intMKey='totals';else if(betTypeApiA==='ou'&&statEnt==='home')intMKey='team_points_home_ou';else if(betTypeApiA==='ou'&&statEnt==='away')intMKey='team_points_away_ou';else if(betTypeApiA==='eo'&&statEnt==='all')intMKey='game_total_eo';else if(betTypeApiA==='eo'&&statEnt==='home')intMKey='team_points_home_eo';else if(betTypeApiA==='eo'&&statEnt==='away')intMKey='team_points_away_eo';else if(betTypeApiA==='ml3way'&&(odd.periodID==='reg'||odd.periodID==='game')){if(['home','away','draw'].includes(side||''))intMKey='reg_ml3way';else if(side?.includes('+')||side==='not_draw')intMKey='reg_double_chance';}mapBetType=betTypeMapping.get(intMKey||'');if(mapBetType&&intMKey){if(intMKey==='h2h')selName=statEnt==='home'?confHome:confAway;else if(intMKey==='spreads')selName=`${statEnt==='home'?confHome:confAway} ${lineVal!==undefined&&lineVal>0?'+':''}${lineVal}`;else if(intMKey==='totals')selName=`${side==='over'?'Over':'Under'} ${lineVal}`;else if(intMKey==='team_points_home_ou')selName=`${confHome} ${side==='over'?'Over':'Under'} ${lineVal}`;else if(intMKey==='team_points_away_ou')selName=`${confAway} ${side==='over'?'Over':'Under'} ${lineVal}`;else if(intMKey.endsWith('_eo')){const teamPart=statEnt==='home'?`${confHome} `:statEnt==='away'?`${confAway} `:``;selName=`${teamPart}Total Points ${side==='even'?'Even':'Odd'}`.trim(); if(!teamPart)selName=`Game Total Points ${side==='even'?'Even':'Odd'}`;}else if(intMKey==='reg_ml3way'){if(side==='home')selName=confHome;else if(side==='away')selName=confAway;else if(side==='draw')selName='Draw';}else if(intMKey==='reg_double_chance'){if(side==='home+draw')selName=`${confHome} or Draw`;else if(side==='away+draw')selName=`${confAway} or Draw`;else if(side==='not_draw')selName=`${confHome} or ${confAway}`;}stats.mS++;}}
          else{stats.skUF++;continue;}

          if(!mapBetType){if(intMKey&&!betTypeMapping.has(intMKey)){newMarketKeys.add(intMKey);console.log(`[DEBUG_NBM_New] Key:'${intMKey}' for odd ${odd.oddID}`);}stats.skNBM++;continue;}
          if(!selName||selName.trim()===''||selName.includes('undefined')||selName.toLowerCase().includes('unknown')){stats.skESN++;console.warn(`[Warn_ESN] Odd:${odd.oddID},Key:${intMKey},Gen:'${selName}'.`);continue;}

          betsToInsRaw.push({game_id:gameId,bet_type_id:mapBetType.id,selection_name:selName,odds:numOdds,line:lineVal,is_active:true,source_bookmaker:bookmakerFilterParam||srcOfOdds,api_last_update:odd.byBookmaker?.[bookmakerFilterParam||'']?.lastUpdatedAt||odd.lastUpdate||new Date().toISOString()});
          stats.oddSucP++;
        }
      }

      const uniqueBetsMap = new Map<string,typeof betsToInsRaw[0]>();
      for(const bet of betsToInsRaw){const k=`${bet.game_id}-${bet.bet_type_id}-${bet.selection_name}-${bet.line??'N/A'}`;if(!uniqueBetsMap.has(k))uniqueBetsMap.set(k,bet);}
      const betsToIns = Array.from(uniqueBetsMap.values());

      if(betsToIns.length>0){const{error:insBetErr}=await supabaseAdmin.from('available_bets').upsert(betsToIns,{onConflict:'game_id,bet_type_id,selection_name,line'});if(insBetErr)console.error(`[Err_AvailBetUpsert] Game ${gameId}:`,insBetErr);else{availableBetsUpsertedCount+=betsToIns.length;console.log(`[Info] Upserted ${betsToIns.length} bets for ${gameId}.`);}}
      else console.log(`[Info] No new/unique odds for ${gameId}.`);
    }

    if(newMarketKeys.size > 0){
      console.log(`[Info_AutoBetType] Found ${newMarketKeys.size} new keys:`, Array.from(newMarketKeys));
      // const bTAToIns = Array.from(newMarketKeys).map(k=>({api_market_key:k,name:`AUTO: ${k}`,description:`Auto-gen: ${k}`}));
      // const{error:autoInsErr}=await supabaseAdmin.from('bet_types').insert(bTAToIns).select(); // Add ON CONFLICT if desired
      // if(autoInsErr)console.error('[Err_AutoInsBetTypes]:',autoInsErr);else console.log(`[Info_AutoBetType] Auto-insert attempt for ${bTAToIns.length}.`);
    }

    const summary=`FN(${FUNCTION_VERSION}) done. EvF:${fetchedEvents.length},GU:${gamesUpsertedCount},BU:${availableBetsUpsertedCount}.`; console.log(`[Summ] ${summary}`); console.log('[Summ_Stats] Detail:',JSON.stringify(stats,null,2));
    return new Response(JSON.stringify({success:true,message:summary,data:{stats}}),{headers:corsHeaders});
  }catch(error){console.error(`[FATAL](${FUNCTION_VERSION}):`,error.message,error.stack);return new Response(JSON.stringify({success:false,error:`Internal Err: ${error.message}`}),{headers:corsHeaders,status:500});}
});