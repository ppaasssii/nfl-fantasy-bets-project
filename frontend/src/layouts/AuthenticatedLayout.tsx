// frontend/src/layouts/AuthenticatedLayout.tsx
import React from 'react'; // Removed unused imports like useState, useCallback
import { supabase } from '../supabaseClient';
import { Routes, Route, Navigate, Link, Outlet, useNavigate, NavLink } from 'react-router-dom';
import { toast } from 'react-toastify';
import { ArrowLeftOnRectangleIcon } from '@heroicons/react/20/solid'; // For logout button

// AuthContextOutletProps and useAuthContext are typically defined in App.tsx
// If you moved them here, ensure App.tsx imports them from here or vice-versa.
// For now, assuming they are correctly available from App.tsx context.
interface AuthContextOutletProps {
    session: any;
}

const AuthenticatedLayout = ({ session, setSession }: {
    session: any,
    setSession: (session: any | null) => void
}) => {
    const navigate = useNavigate();
    const handleLogout = async () => {
        const { error } = await supabase.auth.signOut();
        if (error) { console.error('Error logging out:', error); toast.error("Logout failed."); }
        else { setSession(null); navigate('/login'); toast.success("Logged out successfully."); }
    };

    if (!session) return <Navigate to="/login" replace />;

    const navLinkClasses = ({ isActive }: { isActive: boolean }): string =>
        `px-3 py-2 rounded-md text-sm font-medium transition-colors duration-150 ease-in-out
         hover:bg-sleeper-surface-200 hover:text-sleeper-text-primary
         ${isActive ? 'bg-sleeper-primary text-sleeper-text-on-primary shadow-md' : 'text-sleeper-text-secondary'}`;

    return (
        <div className="bg-sleeper-bg text-sleeper-text-primary min-h-screen font-sans">
            <header className="bg-sleeper-surface-100 shadow-lg sticky top-0 z-50 border-b border-sleeper-border">
                <div className="container mx-auto px-4 sm:px-6 lg:px-8 flex justify-between items-center h-16">
                    {/* Placeholder for Logo/Brand Name */}
                    <Link to="/" className="text-2xl sm:text-3xl font-black tracking-tight text-sleeper-primary hover:opacity-80 transition-opacity flex items-center">
                        {/* Replace with actual SVG logo later if you have one */}
                        <span className="mr-2">🏈</span> {/* Example Emoji Logo */}
                        FantasyBets
                    </Link>

                    <nav className="hidden sm:flex items-center space-x-2">
                        <NavLink to="/" className={navLinkClasses} end>Games</NavLink>
                        <NavLink to="/history" className={navLinkClasses}>Bet History</NavLink>
                        <NavLink to="/profile" className={navLinkClasses}>Profile</NavLink>
                    </nav>

                    <button
                        onClick={handleLogout}
                        className="flex items-center px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-semibold text-white bg-sleeper-error hover:bg-red-700 rounded-md shadow-sm transition-colors duration-150 ease-in-out"
                        title="Logout"
                    >
                        <ArrowLeftOnRectangleIcon className="h-4 w-4 sm:h-5 sm:w-5 mr-0 sm:mr-2" />
                        <span className="hidden sm:inline">Logout</span>
                    </button>
                </div>
                {/* Mobile Nav (can be added later) */}
            </header>

            <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
                <Outlet context={{ session } satisfies AuthContextOutletProps} /> {/* Ensure satisfies AuthContextOutletProps is valid or remove if causing TS error */}
            </main>

            <footer className="text-center py-8 border-t border-sleeper-border mt-12">
                <p className="text-xs text-sleeper-text-secondary">
                    © {new Date().getFullYear()} FantasyBets. For entertainment purposes only.
                </p>
            </footer>
        </div>
    );
};

export default AuthenticatedLayout;