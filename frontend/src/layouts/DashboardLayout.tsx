// src/layouts/DashboardLayout.tsx
import React from 'react';
import { useLocation } from 'react-router-dom';
import { useAppOutletContext } from '../App';
import BetSlip from '../components/BetSlip';
import GameList from '../components/GameList';
import GameDetailPage from '../components/GameDetailPage';

const DashboardLayout: React.FC = () => {
    // Nimmt den Context direkt vom Outlet des AuthenticatedLayout
    const context = useAppOutletContext();
    const location = useLocation();

    const isDetailPage = location.pathname.startsWith('/game/');

    return (
        <>
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                <h1 className="text-2xl sm:text-3xl font-bold text-white">{isDetailPage ? 'Game Details' : 'Games'}</h1>
                <div className="w-full md:w-auto p-4 bg-sleeper-surface-100 rounded-xl shadow-lg border border-sleeper-border flex items-center justify-between md:block min-h-[84px]">
                    <h2 className="text-md sm:text-lg font-semibold mb-1 sm:mb-2 text-sleeper-text-secondary">Balance:</h2>
                    {context.loadingProfile ? (
                        <div className="animate-pulse flex items-center h-9"><div className="h-7 bg-sleeper-surface-200 rounded-md w-32"></div></div>
                    ) : context.fantasyBalance !== null ? (
                        <p className="text-2xl sm:text-3xl font-bold text-sleeper-success">${context.fantasyBalance.toFixed(2)}</p>
                    ) : (
                        <p className="text-2xl sm:text-3xl font-bold text-sleeper-error">N/A</p>
                    )}
                </div>
            </div>
            <div className="lg:grid lg:grid-cols-12 lg:gap-x-6">
                <div className="lg:col-span-8 mb-6 lg:mb-0">
                    {/* Rendert explizit die korrekte Komponente. Kein Outlet hier. */}
                    {isDetailPage ? <GameDetailPage /> : <GameList />}
                </div>
                <div className="hidden lg:block lg:col-span-4">
                    <div className="sticky top-20">
                        <BetSlip
                            selectedBets={context.selectedBets}
                            onRemoveBet={context.removeFromBetSlip}
                            onClearSlip={context.clearBetSlip}
                            onPlaceBet={context.placeBet}
                            isPlacingBet={context.isPlacingBet}
                            stake={context.stake}
                            onStakeChange={context.setStake}
                            fantasyBalance={context.fantasyBalance}
                        />
                    </div>
                </div>
            </div>
        </>
    );
};

export default DashboardLayout;