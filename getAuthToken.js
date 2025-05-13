// getAuthToken.js
const { createClient } = require('@supabase/supabase-js');

// Replace with your actual Supabase URL and Anon Key
const SUPABASE_URL = 'https://bvnlajhvnzflcyavhiff.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ2bmxhamh2bnpmbGN5YXZoaWZmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDY4MzAwNDcsImV4cCI6MjA2MjQwNjA0N30.kO0yCoHZ_4B1z7gCNzsOj2uWJNoU6Gs376kF0O-jQCg';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function signInAndGetToken() {
    const email = 'pascal.knoller@gmail.com'; // IMPORTANT: Use an EXISTING user's email
    const password = 'Spiderman1907!';     // The password for that user

    // Sign in the user
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
            console.log(data.session.access_token); // <-- THIS IS WHAT YOU NEED
        } else {
            console.log('No session data received after sign in.');
        }
    } catch (e) {
        console.error("Exception during sign in:", e);
    }
}

signInAndGetToken();