// src/components/ProfilePage.tsx
import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { useAuthContext } from '../App'; // Use the correct context hook for session
import { toast } from 'react-toastify';

interface ProfileData {
    username: string | null;
    fantasy_balance: number | null;
    created_at?: string; // This comes from auth.users, profiles might have its own or rely on join
    updated_at?: string; // For optimistic updates or if you store it
}

const ProfilePage: React.FC = () => {
    const { session } = useAuthContext(); // Correctly use useAuthContext
    const [loading, setLoading] = useState(true);
    const [profile, setProfile] = useState<ProfileData | null>(null);
    const [usernameInput, setUsernameInput] = useState('');
    const [isUpdatingUsername, setIsUpdatingUsername] = useState(false);

    const fetchProfile = useCallback(async (isMounted: boolean) => {
        if (!session?.user) {
            if (isMounted) setLoading(false);
            return;
        }
        if (isMounted) setLoading(true);
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('username, fantasy_balance, created_at') // Assuming created_at on profiles is desired
                .eq('id', session.user.id)
                .single();

            if (!isMounted) return;

            if (error) {
                if (error.code === 'PGRST116') { // Profile doesn't exist yet
                    console.warn('ProfilePage: No profile found. Creating a default view.');
                    toast.info("Welcome! Please complete your profile by setting a username.");
                    const defaultUsername = session.user.email?.split('@')[0] || 'NewPlayer';
                    // For a new user, created_at should ideally come from auth.users.created_at
                    setProfile({
                        username: defaultUsername,
                        fantasy_balance: 1000, // Default starting balance
                        created_at: session.user.created_at // Use user's auth creation time
                    });
                    setUsernameInput(defaultUsername);
                } else {
                    throw error; // Re-throw other errors
                }
            } else if (data) {
                setProfile({
                    ...data,
                    created_at: data.created_at || session.user.created_at // Prefer profile's created_at, fallback to auth user
                });
                setUsernameInput(data.username || session.user.email?.split('@')[0] || '');
            }
        } catch (error: any) {
            if (!isMounted) return;
            console.error(`Error fetching profile:`, error);
            toast.error(`Error fetching profile: ${error.message}`);
            // Set a default profile view on error to prevent app crash
            setProfile({
                username: session.user.email?.split('@')[0] || 'ErrorUser',
                fantasy_balance: 0,
                created_at: session.user.created_at
            });
        } finally {
            if (isMounted) setLoading(false);
        }
    }, [session]);

    useEffect(() => {
        let isMounted = true;
        if (session?.user) {
            fetchProfile(isMounted);
        } else {
            setLoading(false); // Not loading if no session
            setProfile(null); // Clear profile if no session
        }

        let profileSubscription: any = null;
        if (session?.user) {
            profileSubscription = supabase
                .channel(`public:profiles:id=eq.${session.user.id}_profile_page_channel`)
                .on(
                    'postgres_changes',
                    { event: '*', schema: 'public', table: 'profiles', filter: `id=eq.${session.user.id}` },
                    (payload) => {
                        console.log('ProfilePage: Profile change received (realtime)!', payload);
                        if (!isMounted) return;
                        if (payload.eventType === 'UPDATE' || payload.eventType === 'INSERT') {
                            const updatedProfile = payload.new as ProfileData;
                            setProfile(prev => ({
                                ...prev,
                                username: updatedProfile.username !== undefined ? updatedProfile.username : prev?.username,
                                fantasy_balance: updatedProfile.fantasy_balance !== undefined ? updatedProfile.fantasy_balance : prev?.fantasy_balance,
                                // created_at usually doesn't change, but keep it from prev if not in payload
                                created_at: updatedProfile.created_at !== undefined ? updatedProfile.created_at : (prev?.created_at || session.user.created_at),
                            }));
                            // Only update usernameInput if user is not actively editing it
                            if (updatedProfile.username && usernameInput !== updatedProfile.username && !isUpdatingUsername) {
                                setUsernameInput(updatedProfile.username);
                            }
                        }
                    }
                )
                .subscribe((status, err) => {
                    if (status === 'SUBSCRIBED') console.log('ProfilePage: Subscribed to profile changes.');
                    if (err) { console.error('ProfilePage: Subscription error', err); toast.error("Realtime connection error for profile.")}
                });
        }
        return () => {
            isMounted = false;
            if (profileSubscription) {
                supabase.removeChannel(profileSubscription)
                    .then(() => console.log('ProfilePage: Unsubscribed from profile changes.'))
                    .catch(err => console.error('ProfilePage: Error unsubscribing', err));
            }
        };
    }, [session, fetchProfile, isUpdatingUsername]); // Added isUpdatingUsername

    const handleUsernameUpdate = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const trimmedUsername = usernameInput.trim();
        if (!session?.user || !trimmedUsername) {
            toast.warn("Username cannot be empty.");
            return;
        }
        if (profile && trimmedUsername === profile.username) {
            toast.info("Username is already set to this value.");
            return;
        }

        setIsUpdatingUsername(true);
        try {
            // Check if profile exists for an update, otherwise it might be an insert (upsert)
            // For simplicity, current Supabase RLS usually handles this via an `upsert` in a trigger or policy
            // We'll assume an `update` is intended if `fetchProfile` found a profile.
            // If `fetchProfile` created a default client-side view due to PGRST116, an `insert` might be needed.
            // Supabase `update` will fail if row doesn't exist. `upsert` is safer if unsure.
            // Let's stick to `update` as `fetchProfile` attempts to create a default view on PGRST116
            // which means next time it might try to update that (if it got created by a trigger).
            // This part is complex without knowing exact DB trigger/RLS for profile creation.
            // Assuming profile row is created by a trigger on auth.users insert.

            const updates = {
                username: trimmedUsername,
                updated_at: new Date().toISOString(),
            };

            const { error } = await supabase
                .from('profiles')
                .update(updates)
                .eq('id', session.user.id);

            if (error) throw error;

            // Optimistic update for UI, though realtime should also catch it
            setProfile(prev => prev ? { ...prev, username: trimmedUsername } : null);
            toast.success('Username updated successfully!');
        } catch (error: any) {
            toast.error(`Error updating username: ${error.message}`);
        } finally {
            setIsUpdatingUsername(false);
        }
    };

    if (loading) return (
        <div className="p-6 bg-sleeper-surface rounded-xl shadow-xl max-w-2xl mx-auto text-center border border-sleeper-border">
            <p className="text-sleeper-text-secondary text-lg">Loading profile...</p>
        </div>
    );

    if (!session || !profile ) { // If no session, or session exists but profile is null (e.g. error during fetch)
        return (
            <div className="p-6 bg-sleeper-surface rounded-xl shadow-xl max-w-2xl mx-auto text-center border border-sleeper-border">
                <p className="text-sleeper-error text-lg">Could not load profile data. Please try again later or ensure you are logged in.</p>
            </div>
        );
    }

    return (
        <div className="p-4 sm:p-8 bg-sleeper-bg-secondary rounded-xl shadow-2xl max-w-2xl mx-auto border border-sleeper-border">
            <h1 className="text-3xl font-bold text-sleeper-primary mb-8 pb-4 border-b border-sleeper-border">
                Your Profile
            </h1>

            <div className="space-y-8">
                <section>
                    <h2 className="text-xl font-semibold text-sleeper-text-primary mb-3">Account Information</h2>
                    <div className="bg-sleeper-surface p-4 sm:p-6 rounded-lg space-y-3 shadow-md border border-sleeper-border">
                        <div className="flex flex-col sm:flex-row sm:items-center">
                            <span className="font-medium text-sleeper-text-secondary w-full sm:w-32 shrink-0 mb-1 sm:mb-0">Email:</span>
                            <span className="text-sleeper-text-primary break-all">{session.user?.email}</span>
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-center">
                            <span className="font-medium text-sleeper-text-secondary w-full sm:w-32 shrink-0 mb-1 sm:mb-0">User ID:</span>
                            <span className="text-sleeper-text-primary text-xs break-all">{session.user?.id}</span>
                        </div>
                        {/* Use profile.created_at which might be from 'profiles' or fallback from 'auth.users' */}
                        {profile.created_at && (
                            <div className="flex flex-col sm:flex-row sm:items-center">
                                <span className="font-medium text-sleeper-text-secondary w-full sm:w-32 shrink-0 mb-1 sm:mb-0">Joined:</span>
                                <span className="text-sleeper-text-primary">{new Date(profile.created_at).toLocaleDateString()}</span>
                            </div>
                        )}
                        <div className="flex flex-col sm:flex-row sm:items-center">
                            <span className="font-medium text-sleeper-text-secondary w-full sm:w-32 shrink-0 mb-1 sm:mb-0">Balance:</span>
                            <span className="font-semibold text-sleeper-success">${profile.fantasy_balance?.toFixed(2) ?? '0.00'}</span>
                        </div>
                    </div>
                </section>

                <section>
                    <h2 className="text-xl font-semibold text-sleeper-text-primary mb-3">Update Username</h2>
                    <form onSubmit={handleUsernameUpdate} className="bg-sleeper-surface p-4 sm:p-6 rounded-lg space-y-4 shadow-md border border-sleeper-border">
                        <div>
                            <label htmlFor="username" className="block text-sm font-medium text-sleeper-text-secondary mb-1">
                                Display Name
                            </label>
                            <input
                                type="text"
                                id="username"
                                value={usernameInput}
                                onChange={(e) => setUsernameInput(e.target.value)}
                                className="w-full px-3 py-2 bg-sleeper-bg-secondary text-sleeper-text-primary border-sleeper-border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-sleeper-primary focus:border-sleeper-primary sm:text-sm"
                                placeholder="Enter your display name"
                                disabled={isUpdatingUsername}
                            />
                        </div>
                        <button
                            type="submit"
                            className="w-full sm:w-auto px-6 py-2.5 bg-sleeper-primary hover:bg-sleeper-primary-hover text-white font-semibold rounded-md shadow-md transition-colors duration-150 ease-in-out disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-sleeper-primary focus:ring-offset-2 focus:ring-offset-sleeper-surface"
                            disabled={isUpdatingUsername || !usernameInput.trim() || (profile && usernameInput.trim() === profile.username)}
                        >
                            {isUpdatingUsername ?
                                ( <span className="flex items-center justify-center">
                                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    Saving...
                                  </span> )
                                : 'Save Username'
                            }
                        </button>
                    </form>
                </section>
            </div>
        </div>
    );
};

export default ProfilePage;