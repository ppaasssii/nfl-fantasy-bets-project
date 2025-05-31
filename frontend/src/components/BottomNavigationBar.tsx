// frontend/src/components/BottomNavigationBar.tsx
import React from 'react';
// import { NavLink, useLocation } from 'react-router-dom'; // useLocation entfernt
import { NavLink } from 'react-router-dom';
// import { HomeIcon, ListBulletIcon, TicketIcon, UserCircleIcon } from '@heroicons/react/24/outline'; // TicketIcon entfernt
import { HomeIcon, ListBulletIcon, UserCircleIcon } from '@heroicons/react/24/outline';


const navigationItems = [
    { name: 'Games', href: '/', icon: HomeIcon },
    { name: 'History', href: '/history', icon: ListBulletIcon },
    // { name: 'Bet Slip', href: '/betslip', icon: TicketIcon }, // Bleibt auskommentiert, daher kein TicketIcon-Import nötig
    { name: 'Profile', href: '/profile', icon: UserCircleIcon },
];

const BottomNavigationBar: React.FC = () => {
    // const location = useLocation(); // Entfernt, da nicht verwendet

    return (
        <nav className="fixed bottom-0 left-0 right-0 bg-sleeper-surface border-t border-sleeper-border shadow-md z-50 lg:hidden">
            <div className="max-w-md mx-auto flex justify-around">
                {navigationItems.map((item) => (
                    <NavLink
                        key={item.name}
                        to={item.href}
                        end={item.href === '/'}
                        className={({ isActive }) =>
                            `flex flex-col items-center justify-center w-full pt-2 pb-1 text-xs
                            ${isActive ? 'text-sleeper-primary' : 'text-sleeper-text-secondary hover:text-sleeper-text-primary'}`
                        }
                    >
                        <item.icon className="h-6 w-6 mb-0.5" />
                        <span>{item.name}</span>
                    </NavLink>
                ))}
            </div>
        </nav>
    );
};

export default BottomNavigationBar;