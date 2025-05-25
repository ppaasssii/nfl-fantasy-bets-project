// supabase/functions/settle-bets/index.ts
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient, SupabaseClient, PostgrestError } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { supabaseAdmin } from '../_shared/supabaseClient.ts'; // Assuming this is correctly set up

console.log(`[settle-bets] Function booting up. Version 1.0.2 - H2H Settlement Logic`);

// Helper function to convert American odds to Decimal odds (from place-bet)
function americanToDecimal(americanOdds: number): number {
  if (americanOdds > 0) return (americanOdds / 100) + 1;
  if (americanOdds < 0) return (100 / Math.abs(americanOdds)) + 1;
  console.warn(`[settle-bets] Invalid American odd for conversion: ${americanOdds}`);
  return 1;
}

interface GameForSettlement {
  id: number; home_team: string; away_team: string; status: string;
  home_score: number; away_score: number; // Made non-null for type safety after check
}

interface AvailableBetForSettlement {
  id: number; selection_name: string; line: number | null;
  bet_type_info: { api_market_key: string; name: string; };
}

interface UserBetSelectionForSettlement {
  id: number; available_bet_id: number; odds_at_placement: number; // American odds
  available_bets: AvailableBetForSettlement; // available_bets joined data
}

interface UserBetToSettle {
  id: number; user_id: string; stake_amount: number; potential_payout: number;
  total_odds: number; // Stored as decimal by place-bet v2
  status: string; bet_type: 'single' | 'parlay';
  user_bet_selections: UserBetSelectionForSettlement[];
}

// Helper function to determine if a single leg/selection won
function isSelectionWinner(
    selection: UserBetSelectionForSettlement,
    game: GameForSettlement
): boolean | null { // Returns true for win, false for loss, null for unable to determine/void/push
  const marketKey = selection.available_bets.bet_type_info.api_market_key;
  const selectionName = selection.available_bets.selection_name;
  // const line = selection.available_bets.line; // Will be used for spreads/totals

  console.log(`[settle-bets] Evaluating selection: ${selectionName}, Market: ${marketKey} for Game ID ${game.id}`);

  // For now, only implement Moneyline (h2h)
  if (marketKey === 'h2h') {
    if (game.home_score > game.away_score) { // Home team won
      return selectionName === game.home_team;
    } else if (game.away_score > game.home_score) { // Away team won
      return selectionName === game.away_team;
    } else { // Draw
      // For H2H, a draw is typically a loss unless "Draw" was a specific option (not handled yet)
      // Or for some sports, it's a PUSH. For NFL H2H, a tie means H2H bets on either team lose.
      // If you want to handle PUSH for ties, return null here or adjust policies.
      console.log(`[settle-bets] Game ${game.id} was a draw. H2H selection '${selectionName}' loses.`);
      return false;
    }
  }
  // TODO: Add logic for 'spreads', 'totals', 'team_points_home_ou', 'team_points_away_ou', player props etc.

  console.warn(`[settle-bets] Market key '${marketKey}' not handled for settlement yet for selection ID ${selection.available_bets.id}`);
  return null; // Cannot determine outcome for unhandled market types
}


serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  console.log("[settle-bets] Received settlement request.");

  try {
    const { data: gamesWithPendingBets, error: rpcError } = await supabaseAdmin
        .rpc('get_games_with_pending_bets_to_settle');
    if (rpcError) { console.error("[settle-bets] RPC Error:", rpcError); throw rpcError; }
    if (!gamesWithPendingBets || gamesWithPendingBets.length === 0) {
      console.log("[settle-bets] No games require settlement.");
      return new Response(JSON.stringify({ success: true, message: "No games to settle." }), { headers: corsHeaders });
    }
    const gameIdsToProcess: number[] = gamesWithPendingBets.map((g: any) => g.game_id);
    console.log(`[settle-bets] Games to process: ${gameIdsToProcess.join(', ')}`);

    let totalGamesProcessedForSettlement = 0;
    let totalUserBetsUpdated = 0;
    let totalBalanceUpdates = 0;

    for (const gameId of gameIdsToProcess) {
      console.log(`[settle-bets] ---- Processing Game ID: ${gameId} ----`);
      const { data: gameDetails, error: gameDetErr } = await supabaseAdmin.from('games').select('*').eq('id', gameId).single();
      if (gameDetErr || !gameDetails) { console.error(`[settle-bets] Err game details ${gameId}:`, gameDetErr); continue; }
      const game = gameDetails as GameForSettlement;
      if (game.home_score === null || game.away_score === null) { console.warn(`[settle-bets] Game ${game.id} no scores. Skipping.`); continue; }
      console.log(`[settle-bets] Game ${game.id}: ${game.away_team} ${game.away_score} @ ${game.home_team} ${game.home_score}`);

      const { data: pendingUserBets, error: userBetsErr } = await supabaseAdmin.from('user_bets')
          .select(`*, user_bet_selections!inner(id, available_bet_id, odds_at_placement, available_bets!inner(id, selection_name, line, bet_types!inner(api_market_key, name)))`)
          .eq('status', 'pending').eq('user_bet_selections.available_bets.game_id', game.id);

      if (userBetsErr) { console.error(`[settle-bets] Err fetching pending bets for game ${game.id}:`, userBetsErr); continue; }
      if (!pendingUserBets || pendingUserBets.length === 0) { console.log(`[settle-bets] No pending bets for game ${game.id}.`); continue; }
      console.log(`[settle-bets] Found ${pendingUserBets.length} pending user_bets for game ${game.id}.`);

      for (const userBet of pendingUserBets as UserBetToSettle[]) {
        console.log(`[settle-bets]  -- Evaluating User Bet ID: ${userBet.id} --`);
        let allSelectionsAreWinners = true;
        let isVoidBet = false; // Flag for overall bet void

        for (const selection of userBet.user_bet_selections) {
          // Ensure available_bets is properly nested and has bet_type_info
          if (!selection.available_bets || !selection.available_bets.bet_type_info) {
            console.error(`[settle-bets] Malformed selection data for user_bet_id ${userBet.id}, selection_id ${selection.id}. Missing available_bets or bet_type_info.`);
            allSelectionsAreWinners = false; // Mark as non-winner if data is bad
            isVoidBet = true; // Could also mark as void if data is fundamentally broken
            break;
          }

          const legResult = isSelectionWinner(selection, game);
          if (legResult === false) { // Any leg loses, the whole bet loses (for singles & parlays)
            allSelectionsAreWinners = false;
            break;
          } else if (legResult === null) { // Undetermined/Void leg
            // For a single bet, a void leg makes the whole bet void (stake returned)
            // For a parlay, a void leg is often removed, and odds recalculated (more complex)
            // For now, let's treat any null/void leg as making the whole bet void for simplicity.
            console.log(`[settle-bets] Selection ID ${selection.available_bets.id} for bet ${userBet.id} is VOID/Undetermined.`);
            isVoidBet = true;
            allSelectionsAreWinners = false; // Does not win
            break;
          }
          // If legResult is true, continue checking other legs
        }

        let finalBetStatus: 'WON' | 'LOST' | 'VOID' | 'ERROR' = 'ERROR'; // Default to error
        let balanceChange = 0;

        if (isVoidBet) {
          finalBetStatus = 'VOID';
          balanceChange = userBet.stake_amount; // Refund stake
          console.log(`[settle-bets] User Bet ID ${userBet.id} determined as VOID. Refunding stake: ${balanceChange}`);
        } else if (allSelectionsAreWinners) {
          finalBetStatus = 'WON';
          balanceChange = userBet.potential_payout; // Payout includes stake
          console.log(`[settle-bets] User Bet ID ${userBet.id} determined as WON. Paying out: ${balanceChange}`);
        } else {
          finalBetStatus = 'LOST';
          balanceChange = 0; // No change to balance for a loss (stake already deducted)
          console.log(`[settle-bets] User Bet ID ${userBet.id} determined as LOST.`);
        }

        // Update user_bet status
        const { error: betStatusError } = await supabaseAdmin
            .from('user_bets')
            .update({ status: finalBetStatus })
            .eq('id', userBet.id);

        if (betStatusError) {
          console.error(`[settle-bets] Failed to update status for user_bet ${userBet.id}:`, betStatusError);
          continue; // Skip to next user_bet if status update fails
        }

        // Update profile balance if WON or VOID
        if (finalBetStatus === 'WON' || finalBetStatus === 'VOID') {
          const { error: profileUpdateError } = await supabaseAdmin.rpc('increment_fantasy_balance', {
            user_id_input: userBet.user_id,
            increment_amount: balanceChange
          });
          // We need an SQL function 'increment_fantasy_balance' for atomic update:
          // CREATE OR REPLACE FUNCTION increment_fantasy_balance(user_id_input uuid, increment_amount numeric)
          // RETURNS void AS $$ BEGIN UPDATE public.profiles SET fantasy_balance = fantasy_balance + increment_amount, updated_at = NOW() WHERE id = user_id_input; END; $$ LANGUAGE plpgsql;

          if (profileUpdateError) {
            console.error(`[settle-bets] CRITICAL: Failed to update balance for user ${userBet.user_id} for bet ${userBet.id} (Status ${finalBetStatus}, Amount ${balanceChange}):`, profileUpdateError);
            // This is a critical error state - bet is marked settled but balance not updated. Needs monitoring/manual fix.
          } else {
            totalBalanceUpdates++;
          }
        }

        // Create transaction record
        const { error: transactionError } = await supabaseAdmin.from('transactions').insert({
          user_id: userBet.user_id,
          type: `bet_${finalBetStatus.toLowerCase()}`,
          amount: (finalBetStatus === 'WON' || finalBetStatus === 'VOID') ? balanceChange : 0, // Log payout/refund for won/void, 0 for loss
          related_user_bet_id: userBet.id,
          description: `Bet ID ${userBet.id} settled as ${finalBetStatus}.`
        });
        if (transactionError) console.warn(`[settle-bets] Failed to log transaction for bet ${userBet.id}:`, transactionError);

        totalUserBetsUpdated++;
      }
      totalGamesProcessedForSettlement++;
    }

    return new Response(JSON.stringify({ success: true, message: `Settlement done. Games processed: ${totalGamesProcessedForSettlement}. User bets updated: ${totalUserBetsUpdated}. Balance updates: ${totalBalanceUpdates}.` }), { headers: corsHeaders });
  } catch (error) {
    console.error('[settle-bets] Unhandled error:', error.message, error.stack);
    return new Response(JSON.stringify({ success: false, error: 'Settlement failed.', details: error.message }), { status: 500, headers: corsHeaders });
  }
});