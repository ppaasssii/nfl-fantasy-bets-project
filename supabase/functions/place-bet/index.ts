// supabase/functions/place-bet/index.ts
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

// Ensure Supabase URL and Service Role Key are set in Edge Function environment variables
// e.g., SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

interface BetSelectionRequest {
  available_bet_id: number;
}

interface PlaceBetRequestBody {
  selections: BetSelectionRequest[];
  stake_amount: number;
  bet_type: 'single' | 'parlay';
}

// Helper function to convert American odds to Decimal odds
function americanToDecimal(americanOdds: number): number {
  if (americanOdds > 0) { // For positive odds (e.g., +150)
    return (americanOdds / 100) + 1;
  } else if (americanOdds < 0) { // For negative odds (e.g., -200)
    return (100 / Math.abs(americanOdds)) + 1;
  }
  // This case should ideally not be hit if odds are valid American odds (non-zero)
  // Returning 1 implies even money or an invalid input leading to no change in payout from stake.
  console.warn(`[place-bet] Invalid or zero American odd received for conversion: ${americanOdds}`);
  return 1;
}

function getSupabaseAdminClient(): SupabaseClient {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    console.error("[place-bet] Supabase URL or Service Role Key missing.");
    throw new Error('Server configuration error: Supabase credentials not set.');
  }
  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
  });
}

serve(async (req) => {
  console.log("[place-bet] Function invoked (v2 - Decimal Odds Calc).");

  if (req.method === 'OPTIONS') {
    console.log("[place-bet] Handling OPTIONS request.");
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = getSupabaseAdminClient();
    console.log("[place-bet] Supabase admin client initialized.");

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error("[place-bet] Missing Authorization header.");
      return new Response(JSON.stringify({ error: 'Authentication required.' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);

    if (userError || !user) {
      console.error("[place-bet] User auth failed:", userError?.message || "User not found.");
      return new Response(JSON.stringify({ error: 'Authentication failed.', details: userError?.message }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    console.log(`[place-bet] User ${user.id} authenticated.`);

    const body: PlaceBetRequestBody = await req.json();
    const { selections, stake_amount, bet_type } = body;
    console.log(`[place-bet] Request: ${selections?.length} sel, stake ${stake_amount}, type ${bet_type}.`);

    if (!selections || selections.length === 0 || !stake_amount || stake_amount <= 0 || !bet_type) {
      console.error("[place-bet] Invalid request body:", body);
      return new Response(JSON.stringify({ error: 'Invalid request body.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`[place-bet] Fetching profile for user ${user.id}.`);
    const { data: profile, error: profileError } = await supabaseAdmin
        .from('profiles').select('fantasy_balance').eq('id', user.id).single();

    if (profileError || !profile) {
      console.error(`[place-bet] Err fetching profile ${user.id}:`, profileError?.message || "Not found.");
      return new Response(JSON.stringify({ error: 'Failed to fetch profile.', d: profileError?.message }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    console.log(`[place-bet] User ${user.id} balance: ${profile.fantasy_balance}. Stake: ${stake_amount}`);
    if (profile.fantasy_balance === null || profile.fantasy_balance < stake_amount) {
      console.warn(`[place-bet] User ${user.id} insufficient balance. Has: ${profile.fantasy_balance}, Needs: ${stake_amount}.`);
      return new Response(JSON.stringify({ error: 'Insufficient fantasy balance.' }), {
        status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const selectionIds = selections.map(s => s.available_bet_id);
    console.log(`[place-bet] Fetching details for available_bet IDs: ${selectionIds.join(', ')}.`);
    const { data: availableBetsDetails, error: betsFetchError } = await supabaseAdmin
        .from('available_bets').select('id, odds, is_active, selection_name').in('id', selectionIds);

    if (betsFetchError) {
      console.error("[place-bet] Error fetching bet details:", betsFetchError.message);
      return new Response(JSON.stringify({ error: 'Failed to verify selections.', d: betsFetchError.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    if (!availableBetsDetails || availableBetsDetails.length !== selections.length) {
      const foundIds = availableBetsDetails?.map(b => b.id) || [];
      const missingIds = selectionIds.filter(id => !foundIds.includes(id));
      console.error("[place-bet] Mismatch/missing bet IDs. Req:", selections.length, "Found:", availableBetsDetails?.length, "Missing:", missingIds);
      return new Response(JSON.stringify({ error: 'One or more selections invalid/not found.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const inactiveBets = availableBetsDetails.filter(b => !b.is_active);
    if (inactiveBets.length > 0) {
      const inactiveNames = inactiveBets.map(b => b.selection_name || `ID ${b.id}`).join(', ');
      console.warn(`[place-bet] Bet on inactive selections: ${inactiveNames}`);
      return new Response(JSON.stringify({ error: `Selections no longer active: ${inactiveNames}.` }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // --- Odds Calculation with American to Decimal Conversion ---
    let calculatedTotalDecimalOdds = 1.0;
    if (bet_type === 'single') {
      if (availableBetsDetails.length !== 1) {
        return new Response(JSON.stringify({ error: 'Single bet type requires 1 selection.' }), { status: 400, headers: corsHeaders });
      }
      calculatedTotalDecimalOdds = americanToDecimal(availableBetsDetails[0].odds);
    } else { // Parlay
      for (const bet of availableBetsDetails) {
        calculatedTotalDecimalOdds *= americanToDecimal(bet.odds);
      }
    }
    // Round decimal odds to a reasonable precision, e.g., 4 decimal places
    calculatedTotalDecimalOdds = parseFloat(calculatedTotalDecimalOdds.toFixed(4));

    const potentialPayout = parseFloat((stake_amount * calculatedTotalDecimalOdds).toFixed(2)); // Round to 2 decimal places for currency
    console.log(`[place-bet] American Odds from DB: ${availableBetsDetails.map(b => b.odds).join(', ')}`);
    console.log(`[place-bet] Calculated Total Decimal Odds: ${calculatedTotalDecimalOdds}, Potential Payout: ${potentialPayout}`);
    // --- End Odds Calculation ---

    const newBalance = profile.fantasy_balance - stake_amount;
    console.log(`[place-bet] Deducting ${stake_amount}. User ${user.id} new balance: ${newBalance}.`);
    const { error: balanceUpdateError } = await supabaseAdmin
        .from('profiles').update({ fantasy_balance: newBalance, updated_at: new Date().toISOString() }).eq('id', user.id);
    if (balanceUpdateError) {
      console.error(`[place-bet] Err updating balance for ${user.id}:`, balanceUpdateError.message);
      return new Response(JSON.stringify({ error: 'Failed to update balance.', d: balanceUpdateError.message }), { status: 500, headers: corsHeaders });
    }
    console.log(`[place-bet] Balance updated for ${user.id}.`);

    console.log(`[place-bet] Inserting into user_bets for ${user.id}.`);
    const { data: insertedBet, error: betInsertError } = await supabaseAdmin
        .from('user_bets')
        .insert({
          user_id: user.id, stake_amount: stake_amount, potential_payout: potentialPayout,
          total_odds: calculatedTotalDecimalOdds, // Storing combined decimal odds
          status: 'pending', bet_type: bet_type,
        }).select().single();

    if (betInsertError || !insertedBet) {
      console.error(`[place-bet] Err inserting bet for ${user.id}:`, betInsertError?.message || "No data from insert.");
      console.log(`[place-bet] CRITICAL: Rolling back balance for ${user.id}.`);
      await supabaseAdmin.from('profiles').update({ fantasy_balance: profile.fantasy_balance, updated_at: new Date().toISOString() }).eq('id', user.id); // Refund
      return new Response(JSON.stringify({ error: 'Failed to record bet. Balance restored.', d: betInsertError?.message }), { status: 500, headers: corsHeaders });
    }
    const userBetId = insertedBet.id;
    console.log(`[place-bet] Bet ID ${userBetId} inserted.`);

    const selectionsToInsert = availableBetsDetails.map(dbBet => ({
      user_bet_id: userBetId, available_bet_id: dbBet.id,
      odds_at_placement: dbBet.odds // Store original American odd from DB at placement time
    }));
    console.log(`[place-bet] Inserting ${selectionsToInsert.length} selections for bet_id ${userBetId}.`);
    const { error: selectionsInsertError } = await supabaseAdmin.from('user_bet_selections').insert(selectionsToInsert);

    if (selectionsInsertError) {
      console.error(`[place-bet] Err inserting selections for bet ${userBetId}:`, selectionsInsertError.message);
      await supabaseAdmin.from('user_bets').update({ status: 'error_selections_failed' }).eq('id', userBetId);
      console.log(`[place-bet] CRITICAL: Rolling back balance for user ${user.id}.`);
      await supabaseAdmin.from('profiles').update({ fantasy_balance: profile.fantasy_balance, updated_at: new Date().toISOString() }).eq('id', user.id); // Refund
      return new Response(JSON.stringify({ error: 'Bet recorded but selections failed. Balance restored.', d: selectionsInsertError.message }), { status: 500, headers: corsHeaders });
    }
    console.log(`[place-bet] Bet selections inserted for ${userBetId}.`);

    console.log(`[place-bet] Inserting transaction for ${user.id}, bet ${userBetId}.`);
    const { error: transactionError } = await supabaseAdmin.from('transactions')
        .insert({ user_id: user.id, type: 'bet_placed', amount: -stake_amount, related_user_bet_id: userBetId, description: `Placed ${bet_type} bet.` });
    if (transactionError) console.warn(`[place-bet] Warn: Failed to record tx for bet ${userBetId}:`, transactionError.message);
    else console.log(`[place-bet] Tx recorded for bet ${userBetId}.`);

    console.log(`[place-bet] Bet ${userBetId} placed successfully for ${user.id}.`);
    return new Response(JSON.stringify({ success: true, message: 'Bet placed successfully!', data: { user_bet_id: userBetId, new_balance: newBalance } }), {
      status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[place-bet] UNHANDLED MAIN CATCH ERROR:', error.message, error.stack);
    return new Response(JSON.stringify({ error: 'Unexpected error placing bet.', details: error.message }), { status: 500, headers: corsHeaders });
  }
});