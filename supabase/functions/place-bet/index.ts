// supabase/functions/place-bet/index.ts
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { supabaseAdmin } from '../_shared/supabaseClient.ts';

console.log(`[place-bet] Function booting up. Version 2.1.0 - Simplified RPC Call, DB handles odds/payout`);

interface BetSelectionRequest {
  available_bet_id: number;
}

interface PlaceBetRequestBody {
  selections: BetSelectionRequest[];
  stake_amount: number; // Bei Singles: Gesamteinsatz für alle. Bei Parlay: Gesamteinsatz.
  bet_type: 'single' | 'parlay';
}

serve(async (req: Request) => {
  const requestTimestamp = new Date().toISOString();
  console.log(`[place-bet] ${requestTimestamp} - Received request:`, req.method, req.url);

  if (req.method === 'OPTIONS') {
    console.log(`[place-bet] ${requestTimestamp} - Handling OPTIONS request`);
    return new Response('ok', { headers: corsHeaders });
  }

  let userId = 'unknown_user'; // Für Logging, falls User-Extraktion fehlschlägt

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.warn(`[place-bet] ${requestTimestamp} - Missing Authorization header`);
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(authHeader.replace('Bearer ', ''));
    if (userError || !user) {
      console.warn(`[place-bet] ${requestTimestamp} - Invalid token or user not found:`, userError?.message);
      return new Response(JSON.stringify({ error: 'Invalid token or user not found' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    userId = user.id; // Setze userId für späteres Logging
    console.log(`[place-bet] ${requestTimestamp} - Authenticated user: ${userId}`);

    const { selections, stake_amount, bet_type }: PlaceBetRequestBody = await req.json();
    console.log(`[place-bet] ${requestTimestamp} - Parsed request body for user ${userId}:`, { selections, stake_amount, bet_type });

    if (!selections || selections.length === 0 || !stake_amount || stake_amount <= 0 || !bet_type) {
      console.warn(`[place-bet] ${requestTimestamp} - Invalid request body for user ${userId}:`, { selections, stake_amount, bet_type });
      return new Response(JSON.stringify({ error: 'Invalid request body: Missing selections, stake, or bet type.' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Validierung der Wettoptionen (Aktivität, Spielstart) sollte idealerweise auch in der DB-Funktion robust erfolgen.
    // Die DB-Funktion `handle_place_bet_transaction` enthält bereits Checks für Aktivität.
    // Spielstartzeit-Prüfung ist in der DB-Funktion als TODO markiert und sollte dort implementiert werden.

    console.log(`[place-bet] ${requestTimestamp} - Calling RPC 'handle_place_bet_transaction' for user ${userId}. Stake: ${stake_amount}, Type: ${bet_type}, Selections: ${selections.length}`);
    const { data: rpcResult, error: rpcError } = await supabaseAdmin.rpc('handle_place_bet_transaction', {
      user_id_input: userId,
      stake_amount_input: stake_amount,
      selections_input: selections.map(s => ({ available_bet_id: s.available_bet_id })), // Nur die IDs übergeben
      bet_type_input: bet_type
      // total_odds_input und potential_payout_input werden jetzt in der DB-Funktion berechnet
    });

    if (rpcError) {
      console.error(`[place-bet] ${requestTimestamp} - RPC Error for user ${userId}:`, rpcError);
      return new Response(JSON.stringify({ error: `Failed to place bet: ${rpcError.message}` }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Die DB-Funktion gibt jetzt ein JSON-Objekt mit 'success' und 'error' oder 'message' zurück
    if (rpcResult && !rpcResult.success) {
      console.error(`[place-bet] ${requestTimestamp} - Transaction failed for user ${userId} via RPC:`, rpcResult.error);
      return new Response(JSON.stringify({ error: `Bet placement failed: ${rpcResult.error}` }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    console.log(`[place-bet] ${requestTimestamp} - Bet placed successfully via RPC for user ${userId}. Result:`, rpcResult);
    return new Response(JSON.stringify({
      success: true,
      message: rpcResult?.message || 'Bet placed successfully!',
      data: rpcResult // Enthält z.B. new_balance und Details zu platzierten Wetten
    }), {
      status: 201,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    const errorTimestamp = new Date().toISOString();
    console.error(`[place-bet] ${errorTimestamp} - Unhandled error in function for user ${userId}:`, error.message, error.stack, error);
    return new Response(JSON.stringify({ error: 'An unexpected error occurred on the server.' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});