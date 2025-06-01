// frontend/src/layouts/AuthenticatedLayout.tsx
// import React from 'react'; // Entfernt, da nicht explizit benötigt bei JSX-Transform
import { supabase } from '../supabaseClient';
// import { Navigate, Link, Outlet, useNavigate, NavLink, useLocation } from 'react-router-dom'; // useLocation entfernt
import { Navigate, Link, Outlet, useNavigate, NavLink } from 'react-router-dom';
import { toast } from 'react-toastify';
import { ArrowLeftOnRectangleIcon, Bars3Icon, XMarkIcon } from '@heroicons/react/24/outline';
import { Disclosure } from '@headlessui/react';
import { type AuthContextOutletProps } from '../App';
import BottomNavigationBar from '../components/BottomNavigationBar';

const AuthenticatedLayout = ({ session, setSession }: {
    session: any;
    setSession: (session: any | null) => void;
}) => {
    const navigate = useNavigate();
    // const location = useLocation(); // Entfernt, da nicht verwendet

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
        `px-3 py-2 rounded-md text-sm font-medium transition-colors duration-150
        ${isActive
            ? 'bg-sleeper-primary text-white'
            : 'text-sleeper-text-secondary hover:bg-sleeper-surface-200 hover:text-sleeper-text-primary'
        }`;

    const handleMobileLinkClick = (closeMenu: () => void) => {
        closeMenu();
    };

    return (
        <div className="flex flex-col min-h-screen bg-sleeper-bg">
            <Disclosure as="nav" className="bg-sleeper-surface border-b border-sleeper-border sticky top-0 z-40 hidden lg:block">
                {({ open, close }) => (
                    <>
                        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
                            <div className="flex items-center justify-between h-16">
                                <div className="flex items-center">
                                    <Link to="/" className="flex-shrink-0 text-white font-bold text-xl">
                                        FantasyBets
                                    </Link>
                                </div>
                                <div className="hidden lg:block">
                                    <div className="ml-10 flex items-baseline space-x-4">
                                        {navigation.map((item) => (
                                            <NavLink
                                                key={item.name}
                                                to={item.href}
                                                end={item.end}
                                                className={navLinkClasses}
                                            >
                                                {item.name}
                                            </NavLink>
                                        ))}
                                    </div>
                                </div>
                                <div className="hidden lg:block">
                                    <button
                                        onClick={handleLogout}
                                        className="ml-4 px-3 py-2 rounded-md text-sm font-medium text-sleeper-text-secondary hover:text-white hover:bg-sleeper-surface-200"
                                    >
                                        <ArrowLeftOnRectangleIcon className="h-5 w-5 inline-block mr-1" /> Logout
                                    </button>
                                </div>
                                <div className="-mr-2 flex lg:hidden">
                                    <Disclosure.Button className="inline-flex items-center justify-center p-2 rounded-md text-sleeper-text-secondary hover:text-white hover:bg-sleeper-surface-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-sleeper-bg focus:ring-white">
                                        <span className="sr-only">Open main menu</span>
                                        {open ? (
                                            <XMarkIcon className="block h-6 w-6" aria-hidden="true" />
                                        ) : (
                                            <Bars3Icon className="block h-6 w-6" aria-hidden="true" />
                                        )}
                                    </Disclosure.Button>
                                </div>
                            </div>
                        </div>
                        <Disclosure.Panel className="lg:hidden border-t border-sleeper-border">
                            <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3">
                                {navigation.map((item) => (
                                    <NavLink
                                        key={item.name}
                                        to={item.href}
                                        end={item.end}
                                        onClick={() => handleMobileLinkClick(close)}
                                        className={({ isActive }) =>
                                            `block px-3 py-2 rounded-md text-base font-medium ${isActive
                                                ? 'bg-sleeper-primary text-white'
                                                : 'text-sleeper-text-secondary hover:bg-sleeper-surface-200 hover:text-white'
                                            }`
                                        }
                                    >
                                        {item.name}
                                    </NavLink>
                                ))}
                            </div>
                            <div className="pt-4 pb-3 border-t border-sleeper-border">
                                <div className="flex items-center px-3">
                                    <button
                                        onClick={() => {
                                            handleLogout();
                                            handleMobileLinkClick(close);
                                        }}
                                        className="w-full flex items-center justify-center px-3 py-2 text-base font-medium text-white bg-sleeper-error hover:bg-red-700 rounded-md shadow-sm"
                                    >
                                        <ArrowLeftOnRectangleIcon className="h-5 w-5 mr-2" /> Logout
                                    </button>
                                </div>
                            </div>
                        </Disclosure.Panel>
                    </>
                )}
            </Disclosure>

            <div className="lg:hidden bg-sleeper-surface border-b border-sleeper-border sticky top-0 z-30 flex items-center justify-center h-12">
                <Link to="/" className="text-white font-bold text-lg">
                    FantasyBets
                </Link>
            </div>

            <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 flex-grow pb-20 lg:pb-0">
                <Outlet context={{ session } satisfies AuthContextOutletProps} />
            </main>

            <BottomNavigationBar />

            <footer className="text-center py-6 border-t border-sleeper-border hidden lg:block">
                <p className="text-xs text-sleeper-text-secondary">
                    © {new Date().getFullYear()} FantasyBets. For entertainment purposes only.
                </p>
            </footer>
        </div>
    );
};//INT branching
export default AuthenticatedLayout;