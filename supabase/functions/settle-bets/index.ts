// supabase/functions/settle-bets/index.ts
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { supabaseAdmin } from '../_shared/supabaseClient.ts';

console.log(`[settle-bets] Function booting up. Version 1.0.10 - Improved Player INT Logic`);

function americanToDecimal(americanOdds: number): number { if(americanOdds > 0) return (americanOdds/100)+1; if(americanOdds < 0) return (100/Math.abs(americanOdds))+1; return 1; }

interface GameForSettlement { id: number; home_team: string; away_team: string; status: string; home_score: number; away_score: number; api_results_data?: any; }
interface AvailableBetForSettlement { id: number; selection_name: string; line: number | null; bet_types: { api_market_key: string; name: string; }; statEntityID?: string | null; prop_settlement_value?: number | null; }
interface UserBetSelectionForSettlement { id: number; available_bet_id: number; odds_at_placement: number; available_bets: AvailableBetForSettlement; actual_stat_value_at_settlement?: number | null; }
interface UserBetToSettle { id: number; user_id: string; stake_amount: number; potential_payout: number; total_odds: number; status: string; bet_type: 'single' | 'parlay'; user_bet_selections: UserBetSelectionForSettlement[]; }

interface SettlementLegResult { outcome: boolean | null; actualValue?: number; }

function getPlayerStat(playerApiData: any, playerIdOnBet: string, statKeyFromMarket: string): number | undefined {
  if (!playerApiData || !statKeyFromMarket) return undefined;
  let statValue: any;

  const statMappings: Record<string, string[]> = {
    'rushing_touchdowns': ['rushing_touchdowns', 'rushingTouchdowns'], 'receiving_touchdowns': ['receiving_touchdowns', 'receivingTouchdowns'],
    'passing_touchdowns': ['passing_touchdowns', 'passingTouchdowns'], 'touchdowns': ['touchdowns'], 'anytime_touchdown': ['touchdowns'],
    'rushing_yards': ['rushing_yards', 'rushingYards'], 'rushing_longestrush': ['rushing_longestRush', 'longestRush'],
    'receiving_yards': ['receiving_yards', 'receivingYards'], 'receiving_receptions': ['receiving_receptions', 'receptions'],
    'receiving_longestreception': ['receiving_longestReception', 'longestReception'],
    'defense_combinedtackles': ['defense_combinedTackles', 'combinedTackles', 'tacklesAssists'],
    'passing_interceptions': ['passing_interceptions', 'interceptionsThrown', 'INT_thrown'], // For QB throwing INT
    'defense_interceptions': ['defense_interceptions', 'interceptions', 'INT_made'],      // For DEF player making INT
    'extrapoints_kicksmade': ['extraPoints_kicksMade', 'kicking_extraPointsMade', 'XP_made'],
    'kicking_totalpoints': ['kicking_totalPoints', 'kickerPoints'],
    'fieldgoals_made': ['fieldGoals_made', 'kicking_fieldGoalsMade', 'FG_made']
  };

  const potentialApiKeys = statMappings[statKeyFromMarket] || [statKeyFromMarket, statKeyFromMarket.replace(/_/g, '')];
  for (const key of potentialApiKeys) { if (playerApiData[key] !== undefined) { statValue = playerApiData[key]; break; } }

  if (statKeyFromMarket === 'touchdowns' || statKeyFromMarket === 'anytime_touchdown') { const r=parseFloat(playerApiData.rushing_touchdowns??playerApiData.rushingTouchdowns??'0'),c=parseFloat(playerApiData.receiving_touchdowns??playerApiData.receivingTouchdowns??'0'),d=parseFloat(playerApiData.defense_touchdowns??playerApiData.defensiveTouchdowns??'0'),rt=parseFloat(playerApiData.return_touchdowns??playerApiData.specialTeamsTouchdowns??'0');statValue=(isNaN(r)?0:r)+(isNaN(c)?0:c)+(isNaN(d)?0:d)+(isNaN(rt)?0:rt);}
  else if (statKeyFromMarket === 'kicking_totalpoints') { const x=parseFloat(playerApiData.extraPoints_kicksMade??playerApiData.kicking_extraPointsMade??'0'),f=parseFloat(playerApiData.fieldGoals_made??playerApiData.kicking_fieldGoalsMade??'0');statValue=(isNaN(x)?0:x)*1+(isNaN(f)?0:f)*3;}

  if (typeof statValue==='number'&&!isNaN(statValue))return statValue;if(typeof statValue==='string'&&!isNaN(parseFloat(statValue)))return parseFloat(statValue);
  console.warn(`[getPlayerStat] Stat "${statKeyFromMarket}" for player ${playerIdOnBet} not found in provided keys: ${potentialApiKeys.join(', ')}. PlayerData keys: ${Object.keys(playerApiData || {}).join(', ')}`);
  return undefined;
}

function isSelectionWinner(selection: UserBetSelectionForSettlement, game: GameForSettlement): SettlementLegResult {
  const marketKey = selection.available_bets.bet_types.api_market_key;
  const selectionName = selection.available_bets.selection_name;
  const line = selection.available_bets.line;
  const propApiValue = selection.available_bets.prop_settlement_value;
  const homeScore = game.home_score; const awayScore = game.away_score; const totalScore = homeScore + awayScore;
  const lowerSelection = selectionName.toLowerCase();
  let actualValueForDisplay: number | undefined = undefined;

  switch (marketKey) {
    case 'h2h': actualValueForDisplay = (homeScore > awayScore ? 1 : (awayScore > homeScore ? 2 : 0)); if (homeScore > awayScore) return { outcome: selectionName === game.home_team, actualValue: homeScore }; if (awayScore > homeScore) return { outcome: selectionName === game.away_team, actualValue: awayScore }; return { outcome: false, actualValue: totalScore };
    case 'spreads': { if (line === null||line===undefined) return { outcome: null }; const hP=new RegExp(game.home_team.split(" ").pop()||game.home_team,"i"),aP=new RegExp(game.away_team.split(" ").pop()||game.away_team,"i"); if(hP.test(selectionName)){actualValueForDisplay=homeScore; if((homeScore+line)>awayScore)return{outcome:true,actualValue:homeScore};if((homeScore+line)===awayScore)return{outcome:null,actualValue:homeScore};return{outcome:false,actualValue:homeScore};} if(aP.test(selectionName)){actualValueForDisplay=awayScore; if((awayScore+line)>homeScore)return{outcome:true,actualValue:awayScore};if((awayScore+line)===homeScore)return{outcome:null,actualValue:awayScore};return{outcome:false,actualValue:awayScore};} return {outcome:null}; }
    case 'totals': if(line===null||line===undefined)return{outcome:null};actualValueForDisplay=totalScore;if(lowerSelection.includes('over'))return{outcome:totalScore>line,actualValue:totalScore};if(lowerSelection.includes('under'))return{outcome:totalScore<line,actualValue:totalScore};if(totalScore===line)return{outcome:null,actualValue:totalScore};return{outcome:null};
    case 'team_points_home_ou': if(line===null||line===undefined)return{outcome:null};actualValueForDisplay=homeScore;if(lowerSelection.includes('over'))return{outcome:homeScore>line,actualValue:homeScore};if(lowerSelection.includes('under'))return{outcome:homeScore<line,actualValue:homeScore};if(homeScore===line)return{outcome:null,actualValue:homeScore};return{outcome:null};
    case 'team_points_away_ou': if(line===null||line===undefined)return{outcome:null};actualValueForDisplay=awayScore;if(lowerSelection.includes('over'))return{outcome:awayScore>line,actualValue:awayScore};if(lowerSelection.includes('under'))return{outcome:awayScore<line,actualValue:awayScore};if(awayScore===line)return{outcome:null,actualValue:awayScore};return{outcome:null};
    case 'game_total_eo': actualValueForDisplay=totalScore;return{outcome:lowerSelection.includes('even')?(totalScore%2===0):lowerSelection.includes('odd')?(totalScore%2!==0):null,actualValue:totalScore};
    case 'team_points_home_eo': actualValueForDisplay=homeScore;return{outcome:lowerSelection.includes('even')?(homeScore%2===0):lowerSelection.includes('odd')?(homeScore%2!==0):null,actualValue:homeScore};
    case 'team_points_away_eo': actualValueForDisplay=awayScore;return{outcome:lowerSelection.includes('even')?(awayScore%2===0):lowerSelection.includes('odd')?(awayScore%2!==0):null,actualValue:awayScore};
    default:
      if (marketKey.startsWith('player_')) {
        const playerId = selection.available_bets.statEntityID;
        if (!playerId) { console.warn(`Player prop ${marketKey} missing statEntityID for bet ${selection.available_bets.id}.`); return { outcome: null }; }

        let actualStatValue: number | undefined = undefined;
        if (selection.available_bets.prop_settlement_value !== null && selection.available_bets.prop_settlement_value !== undefined) {
          actualStatValue = selection.available_bets.prop_settlement_value;
        } else {
          if (!game.api_results_data) { console.warn(`Game ${game.id} missing results for player prop.`); return { outcome: null }; }
          const playerSpecificResults = game.api_results_data[playerId];
          if (!playerSpecificResults) { console.warn(`No results for player ${playerId} in game ${game.id}.`); return { outcome: null }; }

          let statCategoryToFetch = marketKey.substring(7, marketKey.lastIndexOf('_'));
          // **** Special handling for QB Interceptions Thrown ****
          // If the market key is for passing_interceptions (intended for QB thrown)
          // but the API for OddData might have used defense_interceptions as statID.
          // The actual player object in api_results_data has 'passing_interceptions' for QBs.
          if (marketKey === 'player_passing_interceptions_ou' || marketKey === 'player_passing_interceptions_yn') {
            statCategoryToFetch = 'passing_interceptions'; // Ensure we use this key for getPlayerStat
            console.log(`[settle-bets] Using statCategory "${statCategoryToFetch}" for QB INT prop on player ${playerId}`);
          } else if (marketKey === 'player_defense_interceptions_ou' || marketKey === 'player_defense_interceptions_yn') {
            statCategoryToFetch = 'defense_interceptions'; // For a defensive player making an INT
            console.log(`[settle-bets] Using statCategory "${statCategoryToFetch}" for DEF INT prop on player ${playerId}`);
          }
          actualStatValue = getPlayerStat(playerSpecificResults, playerId, statCategoryToFetch);
        }

        if (actualStatValue === undefined) { console.warn(`Could not get final stat for ${marketKey}, player ${playerId}.`); return { outcome: null, actualValue: undefined };}
        actualValueForDisplay = actualStatValue;
        const betSubType = marketKey.substring(marketKey.lastIndexOf('_') + 1);

        if (betSubType === 'ou') {
          if (line === null || line === undefined) return { outcome: null, actualValue: actualStatValue };
          if (lowerSelection.includes('over')) return { outcome: actualStatValue > line, actualValue: actualStatValue };
          if (lowerSelection.includes('under')) return { outcome: actualStatValue < line, actualValue: actualStatValue };
          if (actualStatValue === line) return { outcome: null, actualValue: actualStatValue }; // PUSH
        } else if (betSubType === 'yn') {
          let achievedYes = false;
          if (marketKey.includes('touchdown')) achievedYes = actualStatValue >= 1;
          else if (marketKey.includes('interception')) achievedYes = actualStatValue >= 1; // Covers both thrown and made if stat value is count
          // Add more specific 'yn' conditions here
          else achievedYes = actualStatValue > 0;

          if (lowerSelection.includes('yes')) return { outcome: achievedYes, actualValue: actualStatValue };
          if (lowerSelection.includes('no')) return { outcome: !achievedYes, actualValue: actualStatValue };
        }
        return { outcome: null, actualValue: actualStatValue };
      }
      console.warn(`[settle-bets] Market '${marketKey}' not handled.`); return { outcome: null };
  }
}

// --- Main serve function (structure is largely the same) ---
serve(async (req) => {
  // ... (same as v1.0.6 up to the loop for pendingUserBets) ...
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  console.log("[settle-bets] Received settlement request.");
  try {
    const { data: gamesWithPendingBets, error: rpcError } = await supabaseAdmin.rpc('get_games_with_pending_bets_to_settle');
    if (rpcError) { console.error("[settle-bets] RPC Error:", rpcError); throw rpcError; }
    if (!gamesWithPendingBets || gamesWithPendingBets.length === 0) return new Response(JSON.stringify({ success: true, message: "No games require settlement." }), { headers: corsHeaders });
    const gameIdsToProcess: number[] = gamesWithPendingBets.map((g: any) => g.game_id);

    let totalGamesProcessed = 0; let totalUserBetsUpdated = 0; let totalBalanceUpdates = 0;
    for (const gameId of gameIdsToProcess) {
      console.log(`[settle-bets] ---- Processing Game ID: ${gameId} ----`);
      const { data: gameDetails, error: gameDetErr } = await supabaseAdmin.from('games').select('id,home_team,away_team,status,home_score,away_score,api_results_data').eq('id', gameId).single();
      if (gameDetErr || !gameDetails) { console.error(`[settle-bets] Err game details ${gameId}:`, gameDetErr); continue; }
      const game = gameDetails as GameForSettlement;
      if (game.home_score === null || game.away_score === null) { console.warn(`[settle-bets] Game ${game.id} no scores. Skipping.`); continue; }

      const { data: pendingUserBets, error: userBetsErr } = await supabaseAdmin.from('user_bets')
          .select(`id,user_id,stake_amount,potential_payout,total_odds,status,bet_type,user_bet_selections!inner(id,available_bet_id,odds_at_placement,available_bets!inner(id,selection_name,line,statEntityID,prop_settlement_value,bet_types!inner(api_market_key,name)))`)
          .eq('status', 'pending').eq('user_bet_selections.available_bets.game_id', game.id);
      if (userBetsErr||!pendingUserBets||pendingUserBets.length===0) { if(userBetsErr)console.error(`Err pending bets ${game.id}:`,userBetsErr); continue;}

      for (const userBet of pendingUserBets as UserBetToSettle[]) {
        let parlayLegResults: SettlementLegResult[] = [];
        for (const selection of userBet.user_bet_selections) {
          if (!selection.available_bets?.bet_types?.api_market_key) { parlayLegResults.push({outcome: null}); continue; }
          const legSettlementResult = isSelectionWinner(selection, game); // Pass full game object
          parlayLegResults.push(legSettlementResult);
          if (legSettlementResult.actualValue !== undefined) {
            await supabaseAdmin.from('user_bet_selections').update({ actual_stat_value_at_settlement: legSettlementResult.actualValue }).eq('id', selection.id);
          }
        }

        let finalBetStatus: 'WON'|'LOST'|'VOID'|'ERROR' = 'ERROR'; let finalPayout = 0; let finalTotalDecimalOdds = userBet.total_odds;
        if (userBet.bet_type === 'single') {
          if (parlayLegResults.length === 1) {
            if (parlayLegResults[0].outcome === true) { finalBetStatus = 'WON'; finalPayout = userBet.potential_payout; }
            else if (parlayLegResults[0].outcome === false) { finalBetStatus = 'LOST'; finalPayout = 0; }
            else { finalBetStatus = 'VOID'; finalPayout = userBet.stake_amount; }
          }
        } else { /* Parlay */
          if (parlayLegResults.some(r => r.outcome === false)) { finalBetStatus = 'LOST'; finalPayout = 0; }
          else if (parlayLegResults.every(r => r.outcome === null)) { finalBetStatus = 'VOID'; finalPayout = userBet.stake_amount; }
          else if (parlayLegResults.some(r => r.outcome === true)) {
            finalBetStatus = 'WON'; let recalcOdds = 1.0; let validWins = false;
            for (let i = 0; i < userBet.user_bet_selections.length; i++) {
              if (parlayLegResults[i].outcome === true) { recalcOdds *= americanToDecimal(userBet.user_bet_selections[i].odds_at_placement); validWins = true; }
            } if(!validWins && parlayLegResults.some(r => r.outcome === null)){finalBetStatus='VOID'; finalPayout=userBet.stake_amount;} else {finalTotalDecimalOdds=parseFloat(recalcOdds.toFixed(4));finalPayout=parseFloat((userBet.stake_amount * finalTotalDecimalOdds).toFixed(2));}
          }
        }
        if (finalBetStatus === 'ERROR' && parlayLegResults.length > 0 ) { /* If stayed ERROR but legs processed, something is off with parlay conditions */ finalBetStatus = 'VOID'; finalPayout = userBet.stake_amount; console.warn(`Bet ${userBet.id} defaulted to VOID due to unhandled parlay state: ${parlayLegResults.map(r=>r.outcome).join(',')}`);}
        else if (finalBetStatus === 'ERROR') {console.error(`Bet ${userBet.id} in ERROR.`); continue;}


        console.log(`[settle-bets] Bet ${userBet.id} determined as ${finalBetStatus}. Payout/Refund: ${finalPayout}`);
        const updates:any = { status: finalBetStatus };
        if((finalBetStatus === 'WON' || finalBetStatus === 'VOID') && finalPayout !== userBet.potential_payout && userBet.bet_type === 'parlay'){ updates.potential_payout = finalPayout; }
        if(finalBetStatus === 'WON' && finalTotalDecimalOdds !== userBet.total_odds && userBet.bet_type === 'parlay'){ updates.total_odds = finalTotalDecimalOdds; }
        if (finalBetStatus === 'VOID') { updates.potential_payout = userBet.stake_amount; updates.total_odds = 1.0; }

        const { error: betStatusError } = await supabaseAdmin.from('user_bets').update(updates).eq('id', userBet.id);
        if (betStatusError) { console.error(`Fail update status bet ${userBet.id}:`, betStatusError); continue; }
        let balanceChange = 0;
        if (finalBetStatus === 'WON') balanceChange = finalPayout;
        else if (finalBetStatus === 'VOID') balanceChange = userBet.stake_amount;
        if (balanceChange > 0) {
          const { error: pUpdErr } = await supabaseAdmin.rpc('increment_fantasy_balance', { user_id_input:userBet.user_id, increment_amount:balanceChange });
          if (pUpdErr) console.error(`CRIT: Fail update balance user ${userBet.user_id}, bet ${userBet.id} (${finalBetStatus}, Amt ${balanceChange}):`, pUpdErr); else totalBalanceUpdates++;
        }
        await supabaseAdmin.from('transactions').insert({ user_id:userBet.user_id,type:`bet_${finalBetStatus.toLowerCase()}`,amount:balanceChange,related_user_bet_id:userBet.id,description:`Bet ${userBet.id} settled: ${finalBetStatus}.`});
        totalUserBetsUpdated++;
      }
      totalGamesProcessed++;
    }
    return new Response(JSON.stringify({ success: true, message: `Settled. Games: ${totalGamesProcessed}. Bets Updated: ${totalUserBetsUpdated}. Balances: ${totalBalanceUpdates}.` }), { headers: corsHeaders });
  } catch (error) {
    console.error('[settle-bets] Unhandled error:', error.message, error.stack);
    return new Response(JSON.stringify({ success: false, error: 'Settlement fail.', details: error.message }), { status: 500, headers: corsHeaders });
  }
});