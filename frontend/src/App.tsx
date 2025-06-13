// src/App.tsx
import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { type Session } from '@supabase/supabase-js';

import DashboardLayout from './layouts/DashboardLayout';
import AuthenticatedLayout from './layouts/AuthenticatedLayout';
import BetHistoryPage from './components/BetHistoryPage';
import ProfilePage from './components/ProfilePage';
import LeaguesPage from './components/LeaguesPage';
import DebugPage from './components/DebugPage';
import LoginPage from './components/LoginPage.tsx';

// KORREKTUR: Importe ausgelagert
export type { AppContextType } from './AppContext';
export { useAppOutletContext, useAuthContext } from './hooks';


function App() {
    const [session, setSession] = useState<Session | null>(null);
    const [loadingSession, setLoadingSession] = useState(true);

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session); setLoadingSession(false);
        });
        const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => setSession(session));
        return () => listener?.subscription.unsubscribe();
    }, []);

    if (loadingSession) return <div className="flex items-center justify-center min-h-screen bg-sleeper-bg text-sleeper-text-primary text-xl">Loading Session...</div>;

    return (
        <>
            <Routes>
                <Route path="/login" element={!session ? <LoginPage setSession={setSession} /> : <Navigate to="/" replace />} />
                <Route path="/" element={session ? <AuthenticatedLayout session={session} setSession={setSession} /> : <Navigate to="/login" replace />}>
                    <Route index element={<DashboardLayout />} />
                    <Route path="game/:dbGameId" element={<DashboardLayout />} />
                    <Route path="history" element={<BetHistoryPage />} />
                    <Route path="profile" element={<ProfilePage />} />
                    <Route path="leagues" element={<LeaguesPage />} />
                    <Route path="debug" element={<DebugPage />} />
                </Route>
                <Route path="*" element={<Navigate to={session ? "/" : "/login"} replace />} />
            </Routes>
            <ToastContainer position="bottom-right" autoClose={4000} hideProgressBar={false} newestOnTop={false} closeOnClick rtl={false} pauseOnFocusLoss draggable pauseOnHover theme="dark" className="font-sans" />
        </>
    );
}

export default App;