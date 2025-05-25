// In supabase/functions/_shared/cors.ts

export const corsHeaders = {
    'Access-Control-Allow-Origin': '*', // For development. For production, restrict to your frontend URL.
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS', // Added OPTIONS for preflight
};