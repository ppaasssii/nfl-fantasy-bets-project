// getAuthToken.js
require('dotenv').config({ path: '.root.env' }); // Load .root.env
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SCRIPT_SUPABASE_URL || 'https://bvnlajhvnzflcyavhiff.supabase.co'; // Fallback or use env
const SUPABASE_ANON_KEY = process.env.SCRIPT_SUPABASE_ANON_KEY || 'your_anon_key_here'; // Fallback or use env

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function signInAndGetToken() {
    const email = process.env.AUTH_EMAIL;
    const password = process.env.AUTH_PASSWORD;

    if (!email || !password) {
        console.error('Email or password not found in .root.env file.');
        return;
    }

    try {
        const { data, error } = await supabase.auth.signInWithPassword({
            email: email,
            password: password,
        });

        if (error) {
            console.error('Sign in error:', error.message);
            return;
        }

        if (data.session) {
            console.log('Sign in successful!');
            console.log('User ID:', data.user.id);
            console.log('Access Token (JWT):');
            console.log(data.session.access_token);
        } else {
            console.log('No session data received after sign in.');
        }
    } catch (e) {
        console.error("Exception during sign in:", e);
    }
}

signInAndGetToken();