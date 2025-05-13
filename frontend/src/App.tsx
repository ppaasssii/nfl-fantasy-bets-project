// src/App.tsx
import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from './supabaseClient';
import { Routes, Route, Navigate, Link, Outlet, useNavigate, useOutletContext, NavLink } from 'react-router-dom';

import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

import GameList, { type AvailableBetWithBetType as GameListAvailableBet } from './components/GameList';
import BetSlip, { type SelectedBetDisplayInfo } from './components/BetSlip';
import BetHistoryPage from './components/BetHistoryPage';
import ProfilePage from './components/ProfilePage';
import GameDetailPage from './components/GameDetailPage';

interface GameListSelectionType extends GameListAvailableBet {}

// Context for Auth session AND Bet Slip interaction (provided by DashboardLayout)
interface DashboardContextProps {
    session: any; // From AuthenticatedLayout
    onSelectBet: (selection: GameListSelectionType, isQuickBet?: boolean) => void;
    selectedBetIds: number[];
}
export function useDashboardContext() {
    return useOutletContext<DashboardContextProps>();
}

// Context for just Auth session (provided by AuthenticatedLayout)
interface AuthContextProps {
    session: any;
}
export function useAuthContext() {
    return useOutletContext<AuthContextProps>();
}


// --- LoginPage (remains the same) ---
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
        else { toast.error('Login failed, please try again.'); }
        setLoading(false);
    };

    const handleSignUp = async () => {
        setLoading(true);
        if (!email || !password) {
            toast.warn("Email and password are required.");
            setLoading(false);
            return;
        }
        if (password.length < 6) {
            toast.warn("Password should be at least 6 characters.");
            setLoading(false);
            return;
        }
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) { toast.error(error.error_description || error.message); }
        else { toast.success('Sign up successful! Check email for confirmation (if enabled).'); }
        setLoading(false);
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-sleeper-bg text-sleeper-text-primary p-4 font-sans">
            <div className="w-full max-w-xs p-8 space-y-6 bg-sleeper-surface rounded-xl shadow-2xl border border-sleeper-border">
                <h1 className="text-3xl font-bold text-center text-sleeper-primary">FantasyBets Login</h1>
                <form onSubmit={handleLogin} className="space-y-6">
                    <div>
                        <label htmlFor="email-login" className="block text-sm font-medium text-sleeper-text-secondary">Email</label>
                        <input id="email-login" className="w-full px-3 py-2 mt-1 text-sleeper-text-primary bg-sleeper-bg-secondary border-sleeper-border rounded-md focus:outline-none focus:ring-2 focus:ring-sleeper-primary" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
                    </div>
                    <div>
                        <label htmlFor="password-login" className="block text-sm font-medium text-sleeper-text-secondary">Password</label>
                        <input id="password-login" className="w-full px-3 py-2 mt-1 text-sleeper-text-primary bg-sleeper-bg-secondary border-sleeper-border rounded-md focus:outline-none focus:ring-2 focus:ring-sleeper-primary" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required />
                    </div>
                    <button type="submit" className="w-full px-4 py-2.5 font-semibold text-white bg-sleeper-primary hover:bg-sleeper-primary-hover rounded-md focus:outline-none focus:ring-2 focus:ring-sleeper-primary focus:ring-offset-2 focus:ring-offset-sleeper-surface disabled:opacity-60 transition-colors" disabled={loading}>
                        {loading ? 'Logging in...' : 'Login'}
                    </button>
                    <p className="text-center text-sm text-sleeper-text-secondary">Don't have an account?</p>
                    <button type="button" onClick={handleSignUp} className="w-full px-4 py-2 font-semibold text-sleeper-primary border border-sleeper-primary rounded-md hover:bg-sleeper-primary hover:text-white focus:outline-none focus:ring-2 focus:ring-sleeper-primary focus:ring-offset-2 focus:ring-offset-sleeper-surface disabled:opacity-60 transition-colors" disabled={loading}>
                        {loading ? 'Signing up...' : 'Sign Up Here'}
                    </button>
                </form>
            </div>
        </div>
    );
};


// --- AuthenticatedLayout (Provides session context) ---
const AuthenticatedLayout = ({ session, setSession }: {
    session: any,
    setSession: (session: any | null) => void
}) => {
    const navigate = useNavigate();
    const handleLogout = async () => {
        // ... (logout logic same as before)
        const { error } = await supabase.auth.signOut();
        if (error) { console.error('Error logging out:', error); toast.error("Logout failed."); }
        else { setSession(null); navigate('/login'); toast.success("Logged out successfully."); }
    };

    if (!session) return <Navigate to="/login" replace />;

    const navLinkClasses = ({ isActive }: { isActive: boolean }): string =>
        `px-3 py-2 rounded-md text-sm font-medium transition-colors hover:bg-sleeper-surface hover:text-sleeper-text-primary ${isActive ? 'bg-sleeper-primary text-white shadow-md' : 'text-sleeper-text-secondary'}`;

    return (
        <div className="bg-sleeper-bg text-sleeper-text-primary min-h-screen font-sans">
            <header className="bg-sleeper-bg-secondary shadow-lg sticky top-0 z-50 border-b border-sleeper-border">
                {/* ... (header JSX same as before) ... */}
                <div className="container mx-auto px-3 sm:px-6 flex justify-between items-center h-16">
                    <Link to="/" className="text-2xl sm:text-3xl font-black tracking-tight text-sleeper-primary hover:opacity-80 transition-opacity">
                        FantasyBets
                    </Link>
                    <nav className="flex items-center space-x-1 sm:space-x-3">
                        <NavLink to="/" className={navLinkClasses} end>Games</NavLink>
                        <NavLink to="/history" className={navLinkClasses}>Bet History</NavLink>
                        <NavLink to="/profile" className={navLinkClasses}>Profile</NavLink>
                    </nav>
                    <button onClick={handleLogout} className="px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-semibold text-white bg-sleeper-error hover:bg-opacity-80 rounded-md shadow-sm transition-colors">
                        Logout
                    </button>
                </div>
            </header>
            <main className="container mx-auto px-3 py-6 sm:px-6 sm:py-8">
                <Outlet context={{ session } satisfies AuthContextProps} />
            </main>
            <footer className="text-center py-8 border-t border-sleeper-border mt-12">
                <p className="text-xs text-sleeper-text-secondary">© {new Date().getFullYear()} FantasyBets. All rights reserved (for fun!).</p>
            </footer>
        </div>
    );
};


// --- DashboardLayout (Manages BetSlip and provides context for GameList/GameDetail) ---
const DashboardLayout = () => {
    const { session } = useAuthContext(); // Get session from AuthenticatedLayout's context

    // Profile state and logic
    const [loadingProfile, setLoadingProfile] = useState(true);
    const [fantasyBalance, setFantasyBalance] = useState<number | null>(null);
    const [username, setUsername] = useState<string | null>(null);
    const [editingUsername, setEditingUsername] = useState(false);
    const [newUsername, setNewUsername] = useState('');

    // BetSlip State is managed here
    const [selectedBetsForSlip, setSelectedBetsForSlip] = useState<SelectedBetDisplayInfo[]>([]);
    const [isPlacingBet, setIsPlacingBet] = useState(false);
    const [stake, setStake] = useState<string>('');
    const DEFAULT_QUICK_BET_STAKE = "5.00";

    // Profile fetching and subscription (same as before)
    const fetchProfileData = useCallback(async (isMounted: boolean) => {
        if (session?.user) {
            if(isMounted) setLoadingProfile(true);
            try {
                const { data: profileData, error } = await supabase.from('profiles').select('fantasy_balance, username').eq('id', session.user.id).single();
                if (!isMounted) return;
                if (error) {
                    if (error.code === 'PGRST116') {
                        toast.info("Welcome! Complete your profile by setting a username.");
                        const defaultUsername = session.user.email?.split('@')[0] || 'NewUser';
                        setFantasyBalance(1000); setUsername(defaultUsername);
                        if (!editingUsername) setNewUsername(defaultUsername);
                    } else { console.error('FETCH_PROFILE (Dashboard): Error:', error.message); toast.error("Could not load profile.");}
                } else if (profileData) {
                    setFantasyBalance(profileData.fantasy_balance);
                    const currentUsername = profileData.username || session.user.email?.split('@')[0] || 'User';
                    setUsername(currentUsername);
                    if (!editingUsername) setNewUsername(currentUsername);
                }
            } catch (e: any) { if (!isMounted) return; console.error('FETCH_PROFILE (Dashboard): Exception:', e.message); toast.error("Error loading profile.");
            } finally { if(isMounted) setLoadingProfile(false); }
        } else { if(isMounted) { setLoadingProfile(false); setFantasyBalance(null); setUsername(null); }}
    }, [session, editingUsername]);

    useEffect(() => {
        let isMounted = true; fetchProfileData(isMounted);
        let profileSubscription: any = null;
        if (session?.user) {
            profileSubscription = supabase
                .channel(`public:profiles:id=eq.${session.user.id}_dashboard_layout`)
                .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${session.user.id}` },
                    (payload) => {
                        if (!isMounted) return;
                        const newProfileData = payload.new as { fantasy_balance?: number, username?: string };
                        if (newProfileData) {
                            if (typeof newProfileData.fantasy_balance === 'number') setFantasyBalance(newProfileData.fantasy_balance);
                            if (typeof newProfileData.username === 'string') { setUsername(newProfileData.username); if (!editingUsername) setNewUsername(newProfileData.username); }
                        }
                    })
                .subscribe();
        }
        return () => { isMounted = false; if (profileSubscription) supabase.removeChannel(profileSubscription); };
    }, [session, editingUsername, fetchProfileData, isPlacingBet]);

    const handleUpdateUsername = async (event: React.FormEvent<HTMLFormElement>) => { /* ... same as before ... */
        event.preventDefault();
        const trimmedNewUsername = newUsername.trim();
        if (!trimmedNewUsername || !session?.user) { toast.warn("Username cannot be empty."); return; }
        if (trimmedNewUsername === username) { setEditingUsername(false); toast.info("Username unchanged."); return; }
        setEditingUsername(true); setIsPlacingBet(true);
        try {
            const { error } = await supabase.from('profiles').update({ username: trimmedNewUsername, updated_at: new Date().toISOString() }).eq('id', session.user.id);
            if (error) { toast.error(`Failed to update username: ${error.message}`); }
            else { toast.success("Username updated!"); setUsername(trimmedNewUsername); }
        } catch (e: any) { toast.error(`Exception: ${e.message}`); }
        finally { setIsPlacingBet(false); setEditingUsername(false); }
    };

    // Bet Slip Logic specific to DashboardLayout
    const onSelectBetForSlip = useCallback((selectionFromGameList: GameListSelectionType, isQuickBet: boolean = false) => {
        const newBetForSlip: SelectedBetDisplayInfo = {
            id: selectionFromGameList.id,
            selection_name: selectionFromGameList.selection_name,
            odds: selectionFromGameList.odds,
            line: selectionFromGameList.line,
            bet_type_name: selectionFromGameList.bet_types.name,
            home_team: selectionFromGameList.games?.home_team,
            away_team: selectionFromGameList.games?.away_team,
        };
        let alreadyInSlip = false;
        setSelectedBetsForSlip(prevSlip => {
            if (prevSlip.find(b => b.id === newBetForSlip.id)) {
                alreadyInSlip = true; toast.warn("Selection already in slip."); return prevSlip;
            }
            if (prevSlip.length >= 10) { toast.warn("Max 10 selections."); return prevSlip; }
            return [...prevSlip, newBetForSlip];
        });
        if (isQuickBet && !alreadyInSlip) {
            toast.info(`${newBetForSlip.selection_name} added (Quick Bet).`);
            setStake(DEFAULT_QUICK_BET_STAKE);
        }
    }, [DEFAULT_QUICK_BET_STAKE]);

    const handleRemoveBetFromSlip = (availableBetIdToRemove: number) => {
        setSelectedBetsForSlip(prev => prev.filter(b => b.id !== availableBetIdToRemove));
    };

    const handleClearSlip = () => {
        setSelectedBetsForSlip([]);
        setStake('');
    };

    const handleActualPlaceBet = async (stakeToPlace: number, selections: {available_bet_id: number}[], type: 'single'|'parlay') => {
        /* ... same place bet logic ... */
        if (!session?.user) { toast.error("Not logged in."); return; }
        if (selections.length === 0) { toast.warn("No selections."); return; }
        if (stakeToPlace <= 0) { toast.warn("Invalid stake."); return; }
        setIsPlacingBet(true);
        try {
            const { data, error: functionError } = await supabase.functions.invoke('place-bet', {
                body: { selections, stake_amount: stakeToPlace, bet_type: type },
            });
            if (functionError) { toast.error(`Bet failed: ${functionError.message}`); }
            else if (data && data.error) { toast.error(`Bet error: ${data.error}`); }
            else if (data && data.success) { toast.success(data.message || 'Bet placed!'); handleClearSlip(); }
            else { toast.error('Bet status unknown.'); console.warn('Place-bet response:', data); }
        } catch (e: any) { toast.error(`Error: ${e.message}`); }
        finally { setIsPlacingBet(false); }
    };

    if (!session) return <Navigate to="/login" replace />; // Should be caught by AuthenticatedLayout

    return (
        <>
            {/* Profile Info and Username Edit Form (same as before) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                <div className="md:col-span-2 p-4 sm:p-6 bg-sleeper-surface rounded-xl shadow-lg border border-sleeper-border">
                    <div className="flex justify-between items-start">
                        <div><p className="mb-1 text-md sm:text-lg text-sleeper-text-primary">Welcome, <span className="font-semibold text-sleeper-primary">{loadingProfile ? '...' : (username || session.user.email)}</span>!</p></div>
                        {!editingUsername && (<button onClick={() => { setNewUsername(username || session.user.email || ''); setEditingUsername(true); }} className="text-xs text-sleeper-primary hover:opacity-80 underline flex-shrink-0 ml-4" title="Edit display name">Edit Username</button>)}
                    </div>
                    {editingUsername && (
                        <form onSubmit={handleUpdateUsername} className="mt-2 space-y-2 sm:flex sm:items-end sm:gap-2">
                            <div className="flex-grow"><label htmlFor="edit-username-dashboard" className="sr-only">Edit Username</label><input id="edit-username-dashboard" type="text" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} className="w-full px-3 py-1.5 text-sm bg-sleeper-bg-secondary text-sleeper-text-primary border-sleeper-border rounded-md focus:outline-none focus:ring-2 focus:ring-sleeper-primary" placeholder="New username" disabled={isPlacingBet}/></div>
                            <div className="flex gap-2 mt-2 sm:mt-0 flex-shrink-0"><button type="submit" className="px-3 py-1.5 text-xs bg-sleeper-accent hover:bg-opacity-80 rounded-md text-white font-semibold disabled:opacity-50" disabled={isPlacingBet || !newUsername.trim() || newUsername.trim() === username}>{isPlacingBet ? 'Saving...' : 'Save'}</button><button type="button" onClick={() => { setEditingUsername(false); setNewUsername(username || ''); }} className="px-3 py-1.5 text-xs bg-gray-600 hover:bg-gray-500 rounded-md text-white font-semibold" disabled={isPlacingBet}>Cancel</button></div>
                        </form>
                    )}
                </div>
                <div className="p-4 sm:p-6 bg-sleeper-surface rounded-xl shadow-lg border border-sleeper-border">
                    <h2 className="text-md sm:text-lg font-semibold mb-1 sm:mb-2 text-sleeper-text-secondary">Your Fantasy Balance:</h2>
                    {loadingProfile ? <p className="text-2xl sm:text-3xl font-bold text-gray-500">Loading...</p>
                        : fantasyBalance !== null ? <p className="text-2xl sm:text-3xl font-bold text-sleeper-success">${fantasyBalance.toFixed(2)}</p>
                            : <p className="text-2xl sm:text-3xl font-bold text-sleeper-error">Error</p>}
                </div>
            </div>

            <div className="lg:flex lg:space-x-6">
                <div className="lg:w-2/3 mb-6 lg:mb-0">
                    {/* Provide context for GameList and GameDetailPage */}
                    <Outlet context={{
                        session, // session is still from AuthContext via DashboardLayout's useAuthContext
                        onSelectBet: onSelectBetForSlip, // DashboardLayout's function to update its BetSlip
                        selectedBetIds: selectedBetsForSlip.map(b => b.id) // IDs from DashboardLayout's BetSlip
                    } satisfies DashboardContextProps } />
                </div>
                <div className="lg:w-1/3">
                    <div className="sticky top-20">
                        <BetSlip
                            selectedBets={selectedBetsForSlip}
                            onRemoveBet={handleRemoveBetFromSlip}
                            onClearSlip={handleClearSlip}
                            onPlaceBet={handleActualPlaceBet}
                            isPlacingBet={isPlacingBet}
                            stake={stake}
                            onStakeChange={setStake}
                        />
                    </div>
                </div>
            </div>
        </>
    );
};


// --- App Component (Main Router Setup) ---
function App() {
    const [session, setSession] = useState<any | null>(null);
    const [loadingSession, setLoadingSession] = useState(true);

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
            setSession(currentSession);
            setLoadingSession(false);
        });
        const { data: authListener } = supabase.auth.onAuthStateChange((_event, newSession) => {
            setSession(newSession);
        });

        return () => {
            authListener?.subscription?.unsubscribe();
        };
    }, []);

    if (loadingSession) {
        return <div className="flex items-center justify-center min-h-screen bg-sleeper-bg text-sleeper-text-primary text-xl">Loading Session...</div>;
    }

    return (
        <>
            <Routes>
                <Route
                    path="/login"
                    element={!session ? <LoginPage setSession={setSession} /> : <Navigate to="/" replace />}
                />
                <Route
                    element={
                        session ? (
                            <AuthenticatedLayout
                                session={session}
                                setSession={setSession}
                                // No longer passing bet-specific handlers from App directly to AuthenticatedLayout
                            />
                        ) : (
                            <Navigate to="/login" replace />
                        )
                    }
                >
                    {/* DashboardLayout is now the element for the "/" path and its children */}
                    <Route path="/" element={<DashboardLayout />}>
                        <Route index element={<GameList />} />
                        <Route path="game/:gameId" element={<GameDetailPage />} />
                    </Route>
                    <Route path="history" element={<BetHistoryPage />} />
                    <Route path="profile" element={<ProfilePage />} />
                    {/* Catch-all for authenticated users, if no match under DashboardLayout or others */}
                    <Route path="*" element={<Navigate to="/" replace />} />
                </Route>
                <Route path="*" element={<Navigate to="/login" replace />} />
            </Routes>
            <ToastContainer
                position="bottom-right" autoClose={4000} hideProgressBar={false}
                newestOnTop={false} closeOnClick rtl={false}
                pauseOnFocusLoss draggable pauseOnHover theme="dark" className="font-sans"
            />
        </>
    );
}

export default App;