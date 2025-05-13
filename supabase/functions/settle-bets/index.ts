// supabase/functions/settle-bets/index.ts
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

console.log('settle-bets function booting up (with parlay logic)');

type SelectionOutcome = 'won' | 'lost' | 'push';

function determineSelectionOutcome(
    selectionName: string,
    line: number | null,
    betTypeName: string,
    homeTeamName: string,
    awayTeamName: string,
    homeScore: number,
    awayScore: number
): SelectionOutcome {
  // ... (determineSelectionOutcome function remains IDENTICAL to your previous version)
  if (betTypeName === 'Moneyline') {
    if (selectionName === homeTeamName) {
      return homeScore > awayScore ? 'won' : (homeScore < awayScore ? 'lost' : 'push');
    } else if (selectionName === awayTeamName) {
      return awayScore > homeScore ? 'won' : (awayScore < homeScore ? 'lost' : 'push');
    }
  } else if (betTypeName === 'Point Spread') {
    if (line === null) return 'lost';
    if (selectionName === homeTeamName) {
      const effectiveHomeScore = homeScore + line;
      return effectiveHomeScore > awayScore ? 'won' : (effectiveHomeScore < awayScore ? 'lost' : 'push');
    } else if (selectionName === awayTeamName) {
      const effectiveAwayScore = awayScore + line;
      return effectiveAwayScore > homeScore ? 'won' : (effectiveAwayScore < homeScore ? 'lost' : 'push');
    }
  } else if (betTypeName === 'Total Points') {
    if (line === null) return 'lost';
    const totalScore = homeScore + awayScore;
    if (selectionName === 'Over') {
      return totalScore > line ? 'won' : (totalScore < line ? 'lost' : 'push');
    } else if (selectionName === 'Under') {
      return totalScore < line ? 'won' : (totalScore > line ? 'lost' : 'push');
    }
  }
  console.warn(`Could not determine outcome for selection: ${selectionName}, type: ${betTypeName}, line: ${line}`);
  return 'lost';
}

serve(async (_req: Request) => {
  if (_req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    if (!SUPABASE_SERVICE_ROLE_KEY || !supabaseUrl) {
      throw new Error('Missing Supabase service role key or URL.');
    }
    const supabaseAdmin: SupabaseClient = createClient(supabaseUrl, SUPABASE_SERVICE_ROLE_KEY);
    console.log('Supabase admin client initialized for settle-bets.');

    const settlementStats = {
      pendingBetsChecked: 0,
      betsSettled: 0,
      betsSkippedNotCompleted: 0,
      betsSkippedNoSelections: 0,
      singlesSettled: 0,
      parlaysProcessed: 0,
      parlaysWon: 0,
      parlaysLost: 0,
      parlaysVoid: 0,
      errors: 0,
    };

    const { data: pendingUserBets, error: fetchBetsError } = await supabaseAdmin
        .from('user_bets')
        .select(`
                id, user_id, stake_amount, potential_payout, total_odds, bet_type,
                user_bet_selections (
                    id, available_bet_id, odds_at_placement,
                    available_bets (
                        id, selection_name, line, is_winning_outcome, bet_type_id,
                        bet_types (name),
                        game_id,
                        games (id, api_game_id, home_team, away_team, status, home_score, away_score)
                    )
                )
            `)
        .eq('status', 'pending');

    if (fetchBetsError) throw fetchBetsError;
    if (!pendingUserBets || pendingUserBets.length === 0) {
      return new Response(JSON.stringify({ message: "No pending bets to settle.", stats: settlementStats }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
    }
    settlementStats.pendingBetsChecked = pendingUserBets.length;
    console.log(`Found ${pendingUserBets.length} pending bets to check.`);

    for (const userBet of pendingUserBets) {
      console.log(`Processing user_bet ID: ${userBet.id}, Type: ${userBet.bet_type}`);
      if (!userBet.user_bet_selections || userBet.user_bet_selections.length === 0) {
        settlementStats.betsSkippedNoSelections++;
        console.warn(`User bet ID ${userBet.id} has no selections. Marking as error/void.`);
        await supabaseAdmin.from('user_bets').update({ status: 'void', notes: 'No selections found' }).eq('id', userBet.id);
        continue;
      }

      let allLegsReadyForSettlement = true;
      const legOutcomes: SelectionOutcome[] = [];
      let effectiveParlayOdds = 1.0; // For parlays with pushes

      for (const selection of userBet.user_bet_selections) {
        if (!selection.available_bets || !selection.available_bets.games || !selection.available_bets.bet_types) {
          console.error(`Data integrity issue for selection in user_bet ID ${userBet.id}. Missing related data.`);
          allLegsReadyForSettlement = false; // Cannot settle this bet now
          settlementStats.errors++;
          break;
        }
        const game = selection.available_bets.games;
        if (game.status !== 'completed' || game.home_score === null || game.away_score === null) {
          allLegsReadyForSettlement = false;
          settlementStats.betsSkippedNotCompleted++;
          console.log(`Game ID ${game.id} for bet ${userBet.id} (selection ${selection.id}) not completed. Skipping bet for now.`);
          break;
        }

        let currentLegOutcome: SelectionOutcome;
        if (selection.available_bets.is_winning_outcome !== null) {
          currentLegOutcome = selection.available_bets.is_winning_outcome === true ? 'won' :
              (selection.available_bets.is_winning_outcome === false ? 'lost' : 'push');
        } else {
          currentLegOutcome = determineSelectionOutcome(
              selection.available_bets.selection_name, selection.available_bets.line,
              selection.available_bets.bet_types.name, game.home_team, game.away_team,
              game.home_score, game.away_score
          );
          // Update available_bets.is_winning_outcome
          supabaseAdmin.from('available_bets')
              .update({ is_winning_outcome: currentLegOutcome === 'won' ? true : (currentLegOutcome === 'lost' ? false : null) })
              .eq('id', selection.available_bets.id)
              .then(({ error }) => {
                if (error) console.error(`Error updating is_winning_outcome for AB ${selection.available_bets.id}:`, error);
              });
        }
        legOutcomes.push(currentLegOutcome);

        if (userBet.bet_type === 'parlay') {
          if (currentLegOutcome === 'won') {
            effectiveParlayOdds *= selection.odds_at_placement;
          } else if (currentLegOutcome === 'push') {
            // Odds for pushed leg become 1.0, so no change to effectiveParlayOdds multiplier from this leg
            // It doesn't multiply by 0, it just doesn't contribute its original odds.
          } else if (currentLegOutcome === 'lost') {
            // If any leg loses, the parlay loses. We'll check this after loop.
          }
        }
      } // End of loop for selections in a userBet

      if (!allLegsReadyForSettlement) {
        continue; // Move to the next userBet
      }

      // Determine final bet status
      let finalBetStatus: 'won' | 'lost' | 'void' = 'lost'; // Default
      let finalPayout = 0;
      let finalTotalOdds = userBet.total_odds; // Keep original unless parlay has pushes

      if (userBet.bet_type === 'single') {
        finalBetStatus = legOutcomes[0] as 'won' | 'lost' | 'void'; // Cast, as single has one outcome
        if (finalBetStatus === 'won') finalPayout = userBet.potential_payout;
        else if (finalBetStatus === 'void') finalPayout = userBet.stake_amount; // Refund
        settlementStats.singlesSettled++;
      } else if (userBet.bet_type === 'parlay') {
        settlementStats.parlaysProcessed++;
        if (legOutcomes.includes('lost')) {
          finalBetStatus = 'lost';
          settlementStats.parlaysLost++;
        } else if (legOutcomes.every(outcome => outcome === 'push')) {
          finalBetStatus = 'void';
          finalPayout = userBet.stake_amount; // Refund stake
          settlementStats.parlaysVoid++;
        } else { // No losses, at least one win (others can be pushes)
          finalBetStatus = 'won';
          finalTotalOdds = effectiveParlayOdds; // Use the recalculated odds
          finalPayout = userBet.stake_amount * effectiveParlayOdds;
          settlementStats.parlaysWon++;
        }
      }

      // Update user_bets table
      const updatePayload: { status: string, potential_payout?: number, total_odds?: number, notes?: string } = { status: finalBetStatus };
      if (userBet.bet_type === 'parlay' && (finalBetStatus === 'won' || finalBetStatus === 'void')) {
        // Update payout/odds if they changed due to pushes in a parlay
        if (finalBetStatus === 'won') { // Only update if it won with potentially adjusted odds
          updatePayload.potential_payout = parseFloat(finalPayout.toFixed(2));
          updatePayload.total_odds = parseFloat(finalTotalOdds.toFixed(2));
        }
      }
      if (finalBetStatus === 'void' && userBet.bet_type === 'single' && legOutcomes[0] === 'push') {
        // For single bets that push, ensure potential_payout reflects stake refund if not already
        updatePayload.potential_payout = userBet.stake_amount;
      }


      const { error: updateBetError } = await supabaseAdmin
          .from('user_bets')
          .update(updatePayload)
          .eq('id', userBet.id);

      if (updateBetError) {
        console.error(`Error updating status for user_bet ID ${userBet.id}:`, updateBetError);
        settlementStats.errors++; continue;
      }

      // Update balance and create transaction if won or void
      if (finalBetStatus === 'won' || finalBetStatus === 'void') {
        const { data: profile, error: profileError } = await supabaseAdmin
            .from('profiles').select('fantasy_balance').eq('id', userBet.user_id).single();
        if (profileError || !profile) {
          console.error(`Could not fetch profile for user ${userBet.user_id} for bet ${userBet.id}.`);
          settlementStats.errors++; continue;
        }

        const balanceChange = (finalBetStatus === 'won') ? finalPayout : (finalBetStatus === 'void' ? userBet.stake_amount : 0);
        const newBalance = profile.fantasy_balance + balanceChange;

        const { error: balanceUpdateError } = await supabaseAdmin
            .from('profiles').update({ fantasy_balance: parseFloat(newBalance.toFixed(2)) }).eq('id', userBet.user_id);
        if (balanceUpdateError) {
          console.error(`Error updating balance for user ${userBet.user_id} for bet ${userBet.id}.`);
          settlementStats.errors++; continue;
        }

        const transactionType = finalBetStatus === 'won' ? 'bet_winnings' : 'bet_refund';
        const { error: transactionInsertError } = await supabaseAdmin
            .from('transactions').insert({
              user_id: userBet.user_id, type: transactionType, amount: parseFloat(balanceChange.toFixed(2)),
              related_user_bet_id: userBet.id, description: `${transactionType} for bet ID ${userBet.id}`
            });
        if (transactionInsertError) console.error(`Error inserting transaction for bet ${userBet.id}:`, transactionInsertError);

        console.log(`Bet ID ${userBet.id} settled as ${finalBetStatus}. User ${userBet.user_id} balance updated by ${balanceChange.toFixed(2)}.`);
      } else { // Bet was lost
        console.log(`Bet ID ${userBet.id} settled as ${finalBetStatus}. No balance change.`);
      }
      settlementStats.betsSettled++;
    } // End of for loop for pendingUserBets

    console.log("Bet settlement process finished.", settlementStats);
    return new Response(JSON.stringify({ message: "Bet settlement process finished.", stats: settlementStats }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });

  } catch (error) {
    console.error('Critical error in settle-bets function:', error.message, error.stack);
    return new Response(JSON.stringify({ error: error.message || 'An unexpected error occurred.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
  }
});