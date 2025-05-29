// frontend/src/App.tsx
import React, {useEffect, useState} from 'react';
import {supabase} from './supabaseClient';
import {Routes, Route, Navigate, useNavigate, useOutletContext} from 'react-router-dom';
import {ToastContainer, toast} from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

import DashboardLayout, {
    type DashboardContextType as ImportedDashboardOutletContextType
} from './layouts/DashboardLayout';
import AuthenticatedLayout from './layouts/AuthenticatedLayout'; // Assuming AuthenticatedLayout is also in layouts
import GameList from './components/GameList';
import BetHistoryPage from './components/BetHistoryPage';
import ProfilePage from './components/ProfilePage';
import GameDetailPage from './components/GameDetailPage';

// Context Hook for components rendered by DashboardLayout's <Outlet />
export function useDashboardOutletContext() {
    const context = useOutletContext<ImportedDashboardOutletContextType>();
    if (context === undefined) throw new Error("useDashboardOutletContext must be used within DashboardLayout's Outlet");
    return context;
}

// Context Hook for components directly under AuthenticatedLayout's <Outlet />
export interface AuthContextOutletProps { // EXPORT this interface
    session: any; // Replace 'any' with your actual Supabase Session type (e.g., Session from '@supabase/supabase-js')
}

export function useAuthContext() {
    const context = useOutletContext<AuthContextOutletProps>();
    if (context === undefined) throw new Error("useAuthContext must be used within an AuthenticatedLayout's Outlet");
    return context;
}

// --- LoginPage (No changes needed from your working version) ---
const LoginPage = ({setSession}: { setSession: (session: any | null) => void }) => {
    const [loading, setLoading] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const navigate = useNavigate();
    const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setLoading(true);
        const {data, error} = await supabase.auth.signInWithPassword({email, password});
        if (error) {
            toast.error(error.message);
        } // Use error.message
        else if (data.session) {
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
            toast.warn(!email || !password ? "Email/password required." : "Password min 6 chars.");
            setLoading(false);
            return;
        }
        const {error} = await supabase.auth.signUp({email, password});
        if (error) {
            toast.error(error.message);
        } // Use error.message
        else {
            toast.success('Sign up successful! Check email for confirmation.');
        }
        setLoading(false);
    };
    return (
        <div
            className="flex flex-col items-center justify-center min-h-screen bg-sleeper-bg text-sleeper-text-primary p-4 font-sans">
            <div
                className="w-full max-w-xs p-8 space-y-6 bg-sleeper-surface-100 rounded-xl shadow-2xl border border-sleeper-border">
                <h1 className="text-3xl font-bold text-center text-sleeper-primary">FantasyBets Login</h1>
                <form onSubmit={handleLogin} className="space-y-6">
                    <div><label htmlFor="email-login"
                                className="block text-sm font-medium text-sleeper-text-secondary">Email</label><input
                        id="email-login"
                        className="w-full px-3 py-2 mt-1 text-sleeper-text-primary bg-sleeper-bg border-sleeper-border rounded-md focus:outline-none focus:ring-2 focus:ring-sleeper-primary"
                        type="email" placeholder="you@example.com" value={email}
                        onChange={(e) => setEmail(e.target.value)} required/></div>
                    <div><label htmlFor="password-login"
                                className="block text-sm font-medium text-sleeper-text-secondary">Password</label><input
                        id="password-login"
                        className="w-full px-3 py-2 mt-1 text-sleeper-text-primary bg-sleeper-bg border-sleeper-border rounded-md focus:outline-none focus:ring-2 focus:ring-sleeper-primary"
                        type="password" placeholder="••••••••" value={password}
                        onChange={(e) => setPassword(e.target.value)} required/></div>
                    <button type="submit"
                            className="w-full px-4 py-2.5 font-semibold text-sleeper-text-on-primary bg-sleeper-primary hover:bg-sleeper-primary-hover rounded-md focus:outline-none disabled:opacity-60"
                            disabled={loading}>{loading ? 'Logging in...' : 'Login'}</button>
                    <p className="text-center text-sm text-sleeper-text-secondary">Don't have an account?</p>
                    <button type="button" onClick={handleSignUp}
                            className="w-full px-4 py-2 font-semibold text-sleeper-primary border border-sleeper-primary rounded-md hover:bg-sleeper-primary hover:text-sleeper-text-on-primary disabled:opacity-60"
                            disabled={loading}>{loading ? 'Signing up...' : 'Sign Up Here'}</button>
                </form>
            </div>
        </div>);
};

// --- App Component ---
function App() {
    const [session, setSession] = useState<any | null>(null);
    const [loadingSession, setLoadingSession] = useState(true);
    useEffect(() => {
        supabase.auth.getSession().then(({data: {session}}) => {
            setSession(session);
            setLoadingSession(false);
        });
        const {data: listener} = supabase.auth.onAuthStateChange((_event, session) => setSession(session));
        return () => listener?.subscription.unsubscribe();
    }, []);
    if (loadingSession) return <div
        className="flex items-center justify-center min-h-screen bg-sleeper-bg text-sleeper-text-primary text-xl">Loading
        Session...</div>;
    return (
        <><Routes>
            <Route path="/login"
                   element={!session ? <LoginPage setSession={setSession}/> : <Navigate to="/" replace/>}/>
            <Route path="/" element={session ? <AuthenticatedLayout session={session} setSession={setSession}/> :
                <Navigate to="/login" replace/>}>
                <Route path="/" element={<DashboardLayout/>}>
                    <Route index element={<GameList/>}/>
                    <Route path="game/:dbGameId" element={<GameDetailPage/>}/>
                </Route>
                <Route path="history" element={<BetHistoryPage/>}/>
                <Route path="profile" element={<ProfilePage/>}/>
                <Route path="*" element={<Navigate to="/" replace/>}/>
            </Route>
            <Route path="*" element={<Navigate to={session ? "/" : "/login"} replace/>}/>
        </Routes><ToastContainer position="bottom-right" autoClose={4000} hideProgressBar={false} newestOnTop={false}
                                 closeOnClick rtl={false} pauseOnFocusLoss draggable pauseOnHover theme="dark"
                                 className="font-sans"/></>
    );
}

export default App;