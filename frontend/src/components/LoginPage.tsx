// src/components/LoginPage.tsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { toast } from 'react-toastify';
import { type Session } from '@supabase/supabase-js';

interface LoginPageProps {
    setSession: (session: Session | null) => void;
}

const LoginPage: React.FC<LoginPageProps> = ({ setSession }) => {
    const [loading, setLoading] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const navigate = useNavigate();

    const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setLoading(true);
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
            toast.error(error.message);
        } else if (data.session) {
            setSession(data.session);
            navigate('/');
        } else {
            toast.error('Login failed, please try again.');
        }
        setLoading(false);
    };

    const handleSignUp = async () => {
        setLoading(true);
        if (!email || !password || password.length < 6) {
            toast.warn(!email || !password ? "Email and password are required." : "Password must be at least 6 characters.");
            setLoading(false);
            return;
        }
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) {
            toast.error(error.message);
        } else {
            toast.success('Sign up successful! Please check your email for a confirmation link.');
        }
        setLoading(false);
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-sleeper-bg text-sleeper-text-primary p-4 font-sans">
            <div className="w-full max-w-xs p-8 space-y-6 bg-sleeper-surface-100 rounded-xl shadow-2xl border border-sleeper-border">
                <h1 className="text-3xl font-bold text-center text-sleeper-primary">FantasyBets</h1>
                <form onSubmit={handleLogin} className="space-y-6">
                    <div>
                        <label htmlFor="email-login" className="block text-sm font-medium text-sleeper-text-secondary">Email</label>
                        <input id="email-login" className="w-full px-3 py-2 mt-1 text-sleeper-text-primary bg-sleeper-bg border-sleeper-border rounded-md focus:outline-none focus:ring-2 focus:ring-sleeper-primary" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
                    </div>
                    <div>
                        <label htmlFor="password-login" className="block text-sm font-medium text-sleeper-text-secondary">Password</label>
                        <input id="password-login" className="w-full px-3 py-2 mt-1 text-sleeper-text-primary bg-sleeper-bg border-sleeper-border rounded-md focus:outline-none focus:ring-2 focus:ring-sleeper-primary" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required />
                    </div>
                    <button type="submit" className="w-full px-4 py-2.5 font-semibold text-sleeper-text-on-primary bg-sleeper-primary hover:bg-sleeper-primary-hover rounded-md focus:outline-none disabled:opacity-60" disabled={loading}>
                        {loading ? 'Logging in...' : 'Login'}
                    </button>
                    <p className="text-center text-sm text-sleeper-text-secondary">Don't have an account?</p>
                    <button type="button" onClick={handleSignUp} className="w-full px-4 py-2 font-semibold text-sleeper-primary border border-sleeper-primary rounded-md hover:bg-sleeper-primary hover:text-sleeper-text-on-primary disabled:opacity-60" disabled={loading}>
                        {loading ? 'Signing up...' : 'Sign Up Here'}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default LoginPage;