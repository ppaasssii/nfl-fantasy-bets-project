// supabase/functions/place-bet/index.ts
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

interface BetSelectionRequest {
  available_bet_id: number; // ID from the available_bets table
  // Odds at placement will be fetched server-side for integrity
}

interface PlaceBetRequestBody {
  selections: BetSelectionRequest[];
  stake_amount: number;
  bet_type: 'single' | 'parlay'; // Assuming 'single' for now, parlay logic can be complex
}

console.log('place-bet function booting up');

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 1. Initialize Supabase Admin Client
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    if (!SUPABASE_SERVICE_ROLE_KEY || !supabaseUrl) {
      throw new Error('Missing Supabase service role key or URL.');
    }
    const supabaseAdmin = createClient(supabaseUrl, SUPABASE_SERVICE_ROLE_KEY);
    console.log('Supabase admin client initialized for place-bet.');

    // 2. Get User (Auth is handled by Supabase gateway due to verify_jwt=true)
    // The user object is automatically available in the request context when verify_jwt is true.
    // However, Deno's `req` object doesn't directly expose it.
    // We need to get the Authorization header to extract the JWT and get user ID from it.
    // OR, rely on the fact that if the function is reached, the user is valid,
    // and then use `supabase.auth.getUser()` with the user's JWT if needed.
    // For simplicity with service_role key, we'll get user_id from JWT passed by client.
    // A more robust way when verify_jwt=true is to have Supabase inject user details,
    // but for now, let's assume client sends user_id or we extract from JWT.

    // For this example, we'll assume the client will eventually send the JWT,
    // and we'd decode it. A simpler interim step is for testing, or if frontend can pass user_id.
    // Let's extract from the Authorization header (BEARER token)
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401,
      });
    }
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);

    if (userError || !user) {
      console.error('Error getting user from token:', userError);
      return new Response(JSON.stringify({ error: 'Invalid user token.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401,
      });
    }
    const userId = user.id;
    console.log(`Bet placement request for user ID: ${userId}`);


    // 3. Parse Request Body
    const requestBody: PlaceBetRequestBody = await req.json();
    const { selections, stake_amount, bet_type } = requestBody;

    if (!selections || selections.length === 0 || !stake_amount || stake_amount <= 0 || !bet_type) {
      return new Response(JSON.stringify({ error: 'Invalid request body. Selections, stake_amount, and bet_type are required.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400,
      });
    }
    // For now, let's simplify and assume bet_type is 'single' and there's only one selection
    // You can expand this later to handle multiple selections for parlays.
    if (bet_type === 'single' && selections.length !== 1) {
      return new Response(JSON.stringify({ error: 'Single bets must have exactly one selection.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400,
      });
    }
    // TODO: Add parlay validation if selections.length > 1 and bet_type === 'parlay'


    // 4. Fetch User's Profile & Balance
    const { data: profile, error: profileError } = await supabaseAdmin
        .from('profiles')
        .select('fantasy_balance')
        .eq('id', userId)
        .single();

    if (profileError || !profile) {
      console.error(`Profile not found for user ${userId}:`, profileError);
      return new Response(JSON.stringify({ error: 'User profile not found.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404,
      });
    }
    if (profile.fantasy_balance < stake_amount) {
      return new Response(JSON.stringify({ error: 'Insufficient fantasy balance.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400,
      });
    }

    // 5. Validate Each Bet Selection (Crucial Step)
    let totalOddsForBet = 1;
    const validatedSelectionsData = []; // To store full data of validated selections

    for (const selection of selections) {
      const { data: availableBet, error: betFetchError } = await supabaseAdmin
          .from('available_bets')
          .select(`
          id, 
          odds,
          line,
          is_active,
          game_id,
          games (
            id,
            status,
            game_time
          )
        `)
          .eq('id', selection.available_bet_id)
          .single();

      if (betFetchError || !availableBet) {
        console.error(`Available bet ID ${selection.available_bet_id} not found:`, betFetchError);
        return new Response(JSON.stringify({ error: `Bet selection ID ${selection.available_bet_id} not found.` }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404,
        });
      }

      if (!availableBet.is_active) {
        return new Response(JSON.stringify({ error: `Bet ID ${availableBet.id} is no longer active.` }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400,
        });
      }

      if (!availableBet.games) { // Should not happen if FK is set up correctly
        console.error(`Game data missing for available_bet ID ${availableBet.id}`);
        return new Response(JSON.stringify({ error: `Internal error: Game data missing for bet ${availableBet.id}.` }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500,
        });
      }

      // Game Status and Time Validation
      if (availableBet.games.status !== 'scheduled') {
        return new Response(JSON.stringify({ error: `Game for bet ID ${availableBet.id} is not scheduled (status: ${availableBet.games.status}). Bets cannot be placed.` }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400,
        });
      }
      const gameTime = new Date(availableBet.games.game_time);
      if (gameTime <= new Date()) {
        return new Response(JSON.stringify({ error: `Game for bet ID ${availableBet.id} has already started or passed.` }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400,
        });
      }

      totalOddsForBet *= availableBet.odds; // For parlays; for singles, this is just the selection's odds
      validatedSelectionsData.push({
        available_bet_id: availableBet.id,
        odds_at_placement: availableBet.odds,
        // line_at_placement: availableBet.line // If you need to store this too
      });
    }

    // 6. Calculate Potential Payout
    const potentialPayout = stake_amount * totalOddsForBet;

    // 7. Database Transaction: Deduct balance, insert bet, selections, transaction
    // This should ideally be a database transaction (e.g., using a plpgsql function)
    // to ensure atomicity. For Edge Functions, we do it step-by-step.
    // If a step fails, manual rollback/compensation would be complex.
    // For this fantasy app, sequential operations are likely acceptable.

    // 7a. Deduct stake from profile
    const newBalance = profile.fantasy_balance - stake_amount;
    const { error: balanceUpdateError } = await supabaseAdmin
        .from('profiles')
        .update({ fantasy_balance: newBalance })
        .eq('id', userId);

    if (balanceUpdateError) {
      console.error('Error updating user balance:', balanceUpdateError);
      // TODO: Consider if you need to refund anything if other steps had partially succeeded.
      // For now, assume this is the first major state change.
      return new Response(JSON.stringify({ error: 'Failed to update balance.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500,
      });
    }

    // 7b. Insert into user_bets
    const { data: newUserBet, error: userBetInsertError } = await supabaseAdmin
        .from('user_bets')
        .insert({
          user_id: userId,
          stake_amount: stake_amount,
          potential_payout: potentialPayout,
          total_odds: totalOddsForBet,
          status: 'pending', // 'pending', 'won', 'lost', 'void'
          bet_type: bet_type, // 'single' or 'parlay'
        })
        .select('id')
        .single();

    if (userBetInsertError || !newUserBet) {
      console.error('Error inserting new user_bet:', userBetInsertError);
      // CRITICAL: Rollback balance deduction if possible or flag for admin
      // For now, just error out. A proper transaction would handle this.
      // Attempt to refund (best effort)
      await supabaseAdmin.from('profiles').update({ fantasy_balance: profile.fantasy_balance }).eq('id', userId);
      return new Response(JSON.stringify({ error: 'Failed to record bet. Stake may have been deducted and refunded.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500,
      });
    }
    const userBetId = newUserBet.id;

    // 7c. Insert into user_bet_selections
    const selectionsToInsert = validatedSelectionsData.map(sel => ({
      user_bet_id: userBetId,
      available_bet_id: sel.available_bet_id,
      odds_at_placement: sel.odds_at_placement,
    }));

    const { error: selectionsInsertError } = await supabaseAdmin
        .from('user_bet_selections')
        .insert(selectionsToInsert);

    if (selectionsInsertError) {
      console.error('Error inserting user_bet_selections:', selectionsInsertError);
      // CRITICAL: Rollback user_bets and balance. Complex without transactions.
      // Flag for admin or attempt best-effort rollback.
      // For now, just error out.
      // Attempt to delete user_bet and refund (best effort)
      await supabaseAdmin.from('user_bets').delete().eq('id', userBetId);
      await supabaseAdmin.from('profiles').update({ fantasy_balance: profile.fantasy_balance }).eq('id', userId);
      return new Response(JSON.stringify({ error: 'Failed to record bet selections. Bet may have been voided and stake refunded.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500,
      });
    }

    // 7d. Insert into transactions
    const { error: transactionInsertError } = await supabaseAdmin
        .from('transactions')
        .insert({
          user_id: userId,
          type: 'bet_placed', // e.g., 'bet_placed', 'bet_winnings', 'deposit', 'withdrawal'
          amount: -stake_amount, // Negative for placing a bet
          related_user_bet_id: userBetId,
          description: `Placed ${bet_type} bet.`,
        });

    if (transactionInsertError) {
      console.error('Error inserting transaction:', transactionInsertError);
      // This is less critical for bet validity but important for audit. Log and continue.
      // Consider how to handle this - maybe a retry queue for transactions.
    }

    console.log(`Bet ID ${userBetId} placed successfully for user ${userId}.`);
    return new Response(JSON.stringify({ success: true, message: 'Bet placed successfully!', user_bet_id: userBetId, new_balance: newBalance }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error('Critical error in place-bet function:', error.message, error.stack);
    return new Response(JSON.stringify({ error: error.message || 'An unexpected error occurred.' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});