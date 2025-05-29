// frontend/src/layouts/AuthenticatedLayout.tsx

import { supabase } from '../supabaseClient';
import { Navigate, Link, Outlet, useNavigate, NavLink, useLocation } from 'react-router-dom';
import { toast } from 'react-toastify';
import { ArrowLeftOnRectangleIcon, Bars3Icon, XMarkIcon } from '@heroicons/react/24/outline';
import { Disclosure } from '@headlessui/react';
import { type AuthContextOutletProps } from '../App'; // Assuming type is exported from App.tsx

const AuthenticatedLayout = ({ session, setSession }: {
    session: any, // Consider using the actual Supabase Session type
    setSession: (session: any | null) => void
}) => {
    const navigate = useNavigate();
    const location = useLocation(); // For active link detection in mobile

    const handleLogout = async () => {
        const { error } = await supabase.auth.signOut();
        if (error) {
            console.error('Error logging out:', error);
            toast.error("Logout failed.");
        } else {
            setSession(null);
            navigate('/login');
            toast.success("Logged out successfully.");
        }
    };

    if (!session) {
        return <Navigate to="/login" replace />;
    }

    const navigation = [
        { name: 'Games', href: '/', end: true },
        { name: 'Bet History', href: '/history', end: false },
        { name: 'Profile', href: '/profile', end: false },
    ];

    const navLinkClasses = ({ isActive }: { isActive: boolean }): string =>
        `px-3 py-2 rounded-md text-sm font-semibold transition-colors duration-150 ease-in-out
         hover:bg-sleeper-surface-200 hover:text-sleeper-text-primary
         ${isActive ? 'bg-sleeper-primary text-sleeper-text-on-primary shadow-md' : 'text-sleeper-text-secondary'}`;

    // Simpler active check for Disclosure.Button as NavLink's isActive is not directly passed
    const getMobileNavLinkClass = (href: string, isEnd: boolean = false): string => {
        const isActive = isEnd ? location.pathname === href : location.pathname.startsWith(href) && (location.pathname === href || href ==='/'); // Simplified active check
        return `block px-3 py-2 rounded-md text-base font-medium hover:bg-sleeper-surface-200 hover:text-sleeper-text-primary ${isActive ? 'bg-sleeper-primary text-sleeper-text-on-primary' : 'text-sleeper-text-secondary'}`;
    }

    return (
        <div className="bg-sleeper-bg text-sleeper-text-primary min-h-screen font-sans flex flex-col">
            <Disclosure as="nav" className="bg-sleeper-surface-100 shadow-lg sticky top-0 z-50 border-b border-sleeper-border">
                {({ open, close }) => ( // Added close to Disclosure render prop
                    <>
                        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
                            <div className="flex justify-between items-center h-16">
                                <div className="flex-shrink-0 flex items-center">
                                    <Link to="/" className="flex items-center space-x-2 group">
                                        {/* === YOUR LOGO === */}
                                        {/* Ensure your logo is in `frontend/public/` e.g., /my_logo.svg */}
                                        <img
                                            className="h-8 w-auto sm:h-9 transition-transform duration-200 ease-in-out group-hover:scale-105"
                                            src="/logo.jpeg" // REPLACE THIS with your actual logo path
                                            alt="FantasyBets Logo"
                                        />
                                        <span className="hidden md:block text-2xl sm:text-2xl font-black tracking-tighter text-sleeper-text-primary transition-colors group-hover:text-sleeper-primary-hover">
                                            FantasyBets
                                        </span>
                                    </Link>
                                </div>

                                <div className="hidden sm:ml-6 sm:flex sm:items-center sm:space-x-1 md:space-x-2">
                                    {navigation.map((item) => (
                                        <NavLink key={item.name} to={item.href} end={item.end} className={navLinkClasses}>
                                            {item.name}
                                        </NavLink>
                                    ))}
                                </div>

                                <div className="hidden sm:ml-6 sm:flex sm:items-center">
                                    <button
                                        onClick={handleLogout}
                                        className="flex items-center px-3 py-1.5 text-sm font-semibold text-white bg-sleeper-error hover:bg-red-700 rounded-md shadow-sm transition-colors"
                                        title="Logout"
                                    >
                                        <ArrowLeftOnRectangleIcon className="h-5 w-5 mr-0 sm:mr-1.5" />
                                        <span className="hidden sm:inline">Logout</span>
                                    </button>
                                </div>
                                <div className="-mr-2 flex items-center sm:hidden">
                                    {/* Mobile menu button */}
                                    <Disclosure.Button className="inline-flex items-center justify-center p-2 rounded-md text-sleeper-text-secondary hover:text-sleeper-text-primary hover:bg-sleeper-surface-200 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-sleeper-primary">
                                        <span className="sr-only">Open main menu</span>
                                        {open ? ( <XMarkIcon className="block h-6 w-6" aria-hidden="true" /> ) : ( <Bars3Icon className="block h-6 w-6" aria-hidden="true" /> )}
                                    </Disclosure.Button>
                                </div>
                            </div>
                        </div>

                        <Disclosure.Panel className="sm:hidden border-t border-sleeper-border">
                            <div className="px-2 pt-2 pb-3 space-y-1">
                                {navigation.map((item) => (
                                    // For Disclosure.Button as NavLink, we handle active state via NavLink's own mechanism
                                    <NavLink
                                        key={item.name}
                                        to={item.href}
                                        end={item.end}
                                        className={({isActive}) => getMobileNavLinkClass(item.href, isActive)} // Use isActive from NavLink
                                        onClick={() => close()} // Close menu on click
                                    >
                                        {item.name}
                                    </NavLink>
                                ))}
                            </div>
                            <div className="pt-4 pb-3 border-t border-sleeper-border">
                                <div className="flex items-center px-3">
                                    <button onClick={() => { handleLogout(); close(); }} className="w-full flex items-center justify-center px-3 py-2 text-base font-medium text-white bg-sleeper-error hover:bg-red-700 rounded-md shadow-sm">
                                        <ArrowLeftOnRectangleIcon className="h-5 w-5 mr-2" /> Logout
                                    </button>
                                </div>
                            </div>
                        </Disclosure.Panel>
                    </>
                )}
            </Disclosure>

            <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 flex-grow">
                <Outlet context={{ session } satisfies AuthContextOutletProps} />
            </main>

            <footer className="text-center py-6 border-t border-sleeper-border">
                <p className="text-xs text-sleeper-text-secondary">
                    © {new Date().getFullYear()} FantasyBets. For entertainment purposes only.
                </p>
            </footer>
        </div>
    );
};
export default AuthenticatedLayout;