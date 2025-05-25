// In supabase/functions/_shared/supabaseClient.ts

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// These environment variables should be set in your Supabase project's
// Edge Function settings.
const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

if (!supabaseUrl) {
    throw new Error("SUPABASE_URL environment variable is not set.");
}

if (!supabaseServiceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY environment variable is not set.");
}

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
        // It's good practice to explicitly disable auto-refreshing tokens for service role clients
        // as they don't rely on user sessions.
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
    },
});