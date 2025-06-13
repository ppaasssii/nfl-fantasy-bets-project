// frontend/src/components/BottomNavigationBar.tsx
import React from 'react';
import {NavLink} from 'react-router-dom';
import {ArrowLeftOnRectangleIcon} from '@heroicons/react/24/outline'; // Icons werden von den Props geholt

interface NavItem {
    name: string;
    href: string;
    icon: React.ElementType; // Icon ist jetzt Teil des Typs
}

interface BottomNavigationBarProps {
    navigation: NavItem[];
    onLogout: () => void;
}

const BottomNavigationBar: React.FC<BottomNavigationBarProps> = ({navigation, onLogout}) => {
    return (
        <nav
            className="fixed bottom-0 left-0 right-0 bg-sleeper-surface border-t border-sleeper-border shadow-md z-50 sm:hidden">
            <div className="max-w-md mx-auto flex justify-around">
                {navigation.map((item) => (
                    <NavLink
                        key={item.name}
                        to={item.href}
                        end={item.href === '/'}
                        className={({isActive}) =>
                            `flex flex-col items-center justify-center w-full pt-2 pb-1 text-xs
                            ${isActive ? 'text-sleeper-primary' : 'text-sleeper-text-secondary hover:text-sleeper-text-primary'}`
                        }
                    >
                        {/* --- KORREKTUR: Icon wird hier dynamisch gerendert --- */}
                        <item.icon className="h-6 w-6 mb-0.5"/>
                        <span>{item.name}</span>
                    </NavLink>
                ))}
                <button
                    onClick={onLogout}
                    className="flex flex-col items-center justify-center w-full pt-2 pb-1 text-xs text-sleeper-text-secondary hover:text-sleeper-text-primary"
                >
                    <ArrowLeftOnRectangleIcon className="h-6 w-6 mb-0.5"/>
                    <span>Logout</span>
                </button>
            </div>
        </nav>
    );
};

export default BottomNavigationBar;