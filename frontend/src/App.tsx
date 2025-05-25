// frontend/src/App.tsx
import React, { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import { Routes, Route, Navigate, Link, Outlet, useNavigate, useOutletContext, NavLink } from 'react-router-dom';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

import DashboardLayout, { type DashboardContextType as ImportedDashboardOutletContextType } from './layouts/DashboardLayout';
import GameList from './components/GameList';
import BetHistoryPage from './components/BetHistoryPage';
import ProfilePage from './components/ProfilePage';
import GameDetailPage from './components/GameDetailPage';

export function useDashboardOutletContext() {
    const context = useOutletContext<ImportedDashboardOutletContextType>();
    if (context === undefined) throw new Error("useDashboardOutletContext must be used within DashboardLayout's Outlet");
    return context;
}

interface AuthContextOutletProps { session: any; }
export function useAuthContext() {
    const context = useOutletContext<AuthContextOutletProps>();
    if (context === undefined) throw new Error("useAuthContext must be used within an AuthenticatedLayout's Outlet");
    return context;
}

const LoginPage = ({ setSession }: { setSession: (session: any | null) => void }) => {
    const [loading, setLoading] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const navigate = useNavigate();
    const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault(); setLoading(true);
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) { toast.error(error.error_description || error.message); }
        else if (data.session) { setSession(data.session); navigate('/'); }
        else { toast.error('Login failed.'); }
        setLoading(false);
    };
    const handleSignUp = async () => {
        setLoading(true);
        if (!email || !password || password.length < 6) { toast.warn(!email || !password ? "Email/password required." : "Password min 6 chars."); setLoading(false); return; }
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) { toast.error(error.error_description || error.message); }
        else { toast.success('Sign up successful! Check email for confirmation.'); }
        setLoading(false);
    };
    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-sleeper-bg text-sleeper-text-primary p-4 font-sans">
            <div className="w-full max-w-xs p-8 space-y-6 bg-sleeper-surface rounded-xl shadow-2xl border border-sleeper-border">
                <h1 className="text-3xl font-bold text-center text-sleeper-primary">FantasyBets Login</h1>
                <form onSubmit={handleLogin} className="space-y-6">
                    <div><label htmlFor="email-login" className="block text-sm font-medium text-sleeper-text-secondary">Email</label><input id="email-login" className="w-full px-3 py-2 mt-1 text-sleeper-text-primary bg-sleeper-bg-secondary border-sleeper-border rounded-md focus:outline-none focus:ring-2 focus:ring-sleeper-primary" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
                    <div><label htmlFor="password-login" className="block text-sm font-medium text-sleeper-text-secondary">Password</label><input id="password-login" className="w-full px-3 py-2 mt-1 text-sleeper-text-primary bg-sleeper-bg-secondary border-sleeper-border rounded-md focus:outline-none focus:ring-2 focus:ring-sleeper-primary" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
                    <button type="submit" className="w-full px-4 py-2.5 font-semibold text-white bg-sleeper-primary hover:bg-sleeper-primary-hover rounded-md focus:outline-none disabled:opacity-60" disabled={loading}>{loading ? 'Logging in...' : 'Login'}</button>
                    <p className="text-center text-sm text-sleeper-text-secondary">Don't have an account?</p>
                    <button type="button" onClick={handleSignUp} className="w-full px-4 py-2 font-semibold text-sleeper-primary border border-sleeper-primary rounded-md hover:bg-sleeper-primary hover:text-white disabled:opacity-60" disabled={loading}>{loading ? 'Signing up...' : 'Sign Up Here'}</button>
                </form>
            </div>
        </div>
    );
};

const AuthenticatedLayout = ({ session, setSession }: { session: any, setSession: (session: any | null) => void }) => {
    const navigate = useNavigate();
    const handleLogout = async () => {
        const { error } = await supabase.auth.signOut();
        if (error) { toast.error("Logout failed."); } else { setSession(null); navigate('/login'); toast.success("Logged out."); }
    };
    if (!session) return <Navigate to="/login" replace />;
    const navLinkClasses = ({ isActive }: { isActive: boolean }): string => `px-3 py-2 rounded-md text-sm font-medium transition-colors hover:bg-sleeper-surface hover:text-sleeper-text-primary ${isActive ? 'bg-sleeper-primary text-white shadow-md' : 'text-sleeper-text-secondary'}`;
    return (
        <div className="bg-sleeper-bg text-sleeper-text-primary min-h-screen font-sans">
            <header className="bg-sleeper-bg-secondary shadow-lg sticky top-0 z-50 border-b border-sleeper-border"><div className="container mx-auto px-3 sm:px-6 flex justify-between items-center h-16"><Link to="/" className="text-2xl sm:text-3xl font-black tracking-tight text-sleeper-primary hover:opacity-80">FantasyBets</Link><nav className="flex items-center space-x-1 sm:space-x-3"><NavLink to="/" className={navLinkClasses} end>Games</NavLink><NavLink to="/history" className={navLinkClasses}>Bet History</NavLink><NavLink to="/profile" className={navLinkClasses}>Profile</NavLink></nav><button onClick={handleLogout} className="px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-semibold text-white bg-sleeper-error hover:bg-opacity-80 rounded-md">Logout</button></div></header>
            <main className="container mx-auto px-3 py-6 sm:px-6 sm:py-8"><Outlet context={{ session } satisfies AuthContextOutletProps} /></main>
            <footer className="text-center py-8 border-t border-sleeper-border mt-12"><p className="text-xs text-sleeper-text-secondary">© {new Date().getFullYear()} FantasyBets.</p></footer>
        </div>
    );
};

function App() {
    const [session, setSession] = useState<any | null>(null);
    const [loadingSession, setLoadingSession] = useState(true);
    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => { setSession(session); setLoadingSession(false); });
        const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => setSession(session));
        return () => listener?.subscription.unsubscribe();
    }, []);
    if (loadingSession) return <div className="flex items-center justify-center min-h-screen bg-sleeper-bg text-xl">Loading Session...</div>;
    return (
        <><Routes>
            <Route path="/login" element={!session ? <LoginPage setSession={setSession} /> : <Navigate to="/" replace />} />
            <Route path="/" element={session ? <AuthenticatedLayout session={session} setSession={setSession} /> : <Navigate to="/login" replace />}>
                <Route path="/" element={<DashboardLayout />}>
                    <Route index element={<GameList />} />
                    <Route path="game/:dbGameId" element={<GameDetailPage />} />
                </Route>
                <Route path="history" element={<BetHistoryPage />} />
                <Route path="profile" element={<ProfilePage />} />
                <Route path="*" element={<Navigate to="/" replace />} /> {/* Auth catch-all */}
            </Route>
            <Route path="*" element={<Navigate to={session ? "/" : "/login"} replace />} /> {/* Non-auth catch-all */}
        </Routes><ToastContainer position="bottom-right" autoClose={4000} hideProgressBar={false} newestOnTop={false} closeOnClick rtl={false} pauseOnFocusLoss draggable pauseOnHover theme="dark" className="font-sans"/></>
    );
}
export default App;