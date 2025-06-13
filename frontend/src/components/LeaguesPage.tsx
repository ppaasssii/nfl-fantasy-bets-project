// src/components/LeaguesPage.tsx
import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useAuthContext } from '../App';
import { toast } from 'react-toastify';
import { ArrowPathIcon, ExclamationTriangleIcon, LinkIcon } from '@heroicons/react/24/outline';

interface ProfileData {
    sleeper_user_id: string | null;
    sleeper_username: string | null;
}

const LeaguesPage: React.FC = () => {
    const { session } = useAuthContext();
    const [profile, setProfile] = useState<ProfileData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchProfile = async () => {
            if (!session?.user) {
                setLoading(false);
                return;
            }
            setLoading(true);
            try {
                const { data, error } = await supabase
                    .from('profiles')
                    .select('sleeper_user_id, sleeper_username')
                    .eq('id', session.user.id)
                    .single();

                if (error) throw error;
                setProfile(data);
            } catch (err: any) {
                console.error("Error fetching profile for leagues page:", err);
                setError("Could not load your profile data.");
            } finally {
                setLoading(false);
            }
        };

        fetchProfile();
    }, [session]);

    const handleConnectToSleeper = () => {
        const clientId = import.meta.env.VITE_SLEEPER_CLIENT_ID;
        if (!clientId) {
            toast.error("Sleeper Client ID is not configured. Please contact support.");
            return;
        }

        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const redirectUri = `${supabaseUrl}/functions/v1/sleeper-oauth-callback`;

        const authUrl = `https://sleeper.com/oauth/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}`;

        window.location.href = authUrl;
    };

    const renderContent = () => {
        if (loading) {
            return (
                <div className="flex flex-col items-center justify-center py-20">
                    <ArrowPathIcon className="h-8 w-8 text-sleeper-primary animate-spin" />
                    <p className="mt-3 text-sleeper-text-secondary">Loading Profile...</p>
                </div>
            );
        }

        if (error) {
            return (
                <div className="p-6 bg-sleeper-surface-100 rounded-xl text-center border border-sleeper-error/50">
                    <ExclamationTriangleIcon className="h-10 w-10 mx-auto text-sleeper-error mb-3" />
                    <h3 className="text-lg font-semibold text-sleeper-text-primary">Error</h3>
                    <p className="text-sleeper-text-secondary">{error}</p>
                </div>
            );
        }

        if (profile?.sleeper_user_id) {
            // Zustand, wenn der Nutzer bereits verbunden ist
            return (
                <div className="p-6 bg-sleeper-surface-200 rounded-lg text-center shadow-inner border border-sleeper-border">
                    <h2 className="text-lg font-semibold text-sleeper-text-primary">You are connected to Sleeper!</h2>
                    <p className="text-sleeper-text-secondary mt-1">
                        Connected as: <span className="font-bold text-sleeper-accent">{profile.sleeper_username || profile.sleeper_user_id}</span>
                    </p>
                    <p className="mt-4 text-sm text-sleeper-text-secondary">
                        Here you will soon see a list of your imported leagues.
                    </p>
                </div>
            )
        }

        // Zustand, wenn der Nutzer noch NICHT verbunden ist
        return (
            <div className="bg-sleeper-surface-200/50 p-8 rounded-xl text-center border border-dashed border-sleeper-border">
                <LinkIcon className="mx-auto h-12 w-12 text-sleeper-primary opacity-80" />
                <h2 className="mt-4 text-xl font-bold text-sleeper-text-primary">Connect your Sleeper Account</h2>
                <p className="mt-2 max-w-md mx-auto text-sm text-sleeper-text-secondary">
                    To import your fantasy leagues and compete with your friends, you first need to securely connect your Sleeper account.
                </p>
                <button
                    onClick={handleConnectToSleeper}
                    className="mt-6 inline-flex items-center px-8 py-3 bg-sleeper-primary hover:bg-sleeper-primary-hover text-sleeper-text-on-primary font-semibold rounded-lg shadow-lg transition-transform transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-sleeper-primary focus:ring-offset-2 focus:ring-offset-sleeper-surface-100"
                >
                    Connect to Sleeper
                </button>
            </div>
        );
    };

    return (
        <div className="max-w-4xl mx-auto">
            <h1 className="text-3xl font-bold text-sleeper-text-primary mb-6">Your Leagues</h1>
            {renderContent()}
        </div>
    );
};

export default LeaguesPage;