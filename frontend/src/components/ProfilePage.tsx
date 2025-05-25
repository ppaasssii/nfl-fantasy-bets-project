// frontend/src/components/ProfilePage.tsx
import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { useAuthContext } from '../App'; // Assuming AuthContext is provided via App
import { toast } from 'react-toastify';
import { User } from '@supabase/supabase-js'; // Import User type

interface ProfileData {
    username: string | null;
    fantasy_balance: number | null;
    created_at?: string; // This is the profile's created_at or auth user's
    updated_at?: string; // For optimistic updates or if you store it
}

const ProfilePage: React.FC = () => {
    const { session } = useAuthContext();
    const [loading, setLoading] = useState(true);
    const [profile, setProfile] = useState<ProfileData | null>(null);
    const [usernameInput, setUsernameInput] = useState('');
    const [isUpdatingUsername, setIsUpdatingUsername] = useState(false);

    const createDefaultProfileView = (authUser: User): ProfileData => {
        const defaultUsername = authUser.email?.split('@')[0] || `Player${authUser.id.substring(0, 4)}`;
        return {
            username: defaultUsername,
            fantasy_balance: 1000, // Default starting balance
            created_at: authUser.created_at // Use user's auth creation time
        };
    };

    const fetchProfile = useCallback(async () => {
        if (!session?.user) {
            setLoading(false);
            setProfile(null); // Clear profile if no session
            return;
        }
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('username, fantasy_balance, created_at') // created_at from profiles table
                .eq('id', session.user.id)
                .single();

            if (error) {
                if (error.code === 'PGRST116') { // Profile doesn't exist for user yet
                    console.warn('ProfilePage: No profile row. Using default view and encouraging update.');
                    const defaultView = createDefaultProfileView(session.user);
                    setProfile(defaultView);
                    setUsernameInput(defaultView.username || '');
                    toast.info("Welcome! Set your username to complete your profile.");
                } else {
                    throw error;
                }
            } else if (data) {
                setProfile({
                    ...data,
                    // If profiles.created_at is null/undefined (should not happen if table has default), use auth user's
                    created_at: data.created_at || session.user.created_at
                });
                setUsernameInput(data.username || '');
            } else { // Should not happen with .single() unless error, but as a fallback
                console.warn('ProfilePage: No profile data returned and no error. Using default.');
                const defaultView = createDefaultProfileView(session.user);
                setProfile(defaultView);
                setUsernameInput(defaultView.username || '');
            }
        } catch (error: any) {
            console.error(`Error fetching profile:`, error);
            toast.error(`Error fetching profile: ${error.message}`);
            // Fallback to a default view on error
            if (session?.user) {
                const defaultView = createDefaultProfileView(session.user);
                setProfile(defaultView);
                setUsernameInput(defaultView.username || '');
            }
        } finally {
            setLoading(false);
        }
    }, [session]);

    useEffect(() => {
        fetchProfile();

        let profileSubscription: ReturnType<typeof supabase.channel> | null = null;
        if (session?.user) {
            profileSubscription = supabase
                .channel(`public:profiles:id=eq.${session.user.id}`)
                .on(
                    'postgres_changes',
                    { event: '*', schema: 'public', table: 'profiles', filter: `id=eq.${session.user.id}` },
                    (payload) => {
                        console.log('ProfilePage: Profile change received (realtime)!', payload);
                        if (payload.eventType === 'UPDATE' || payload.eventType === 'INSERT') {
                            const updatedRecord = payload.new as ProfileData; // Assuming new record matches ProfileData structure
                            setProfile(currentProfile => {
                                // Merge, ensuring existing created_at (from auth fallback) is preserved if not in payload
                                const baseCreatedAt = currentProfile?.created_at || session.user?.created_at;
                                return {
                                    username: updatedRecord.username,
                                    fantasy_balance: updatedRecord.fantasy_balance,
                                    created_at: updatedRecord.created_at || baseCreatedAt,
                                    updated_at: updatedRecord.updated_at,
                                };
                            });
                            // Only update usernameInput if user is not actively editing it
                            if (updatedRecord.username && usernameInput !== updatedRecord.username && !document.hasFocus()) { // Example condition
                                setUsernameInput(updatedRecord.username);
                            }
                        }
                    }
                )
                .subscribe((status, err) => {
                    if (status === 'SUBSCRIBED') console.log('ProfilePage: Subscribed to profile changes.');
                    if (err) console.error('ProfilePage: Subscription error', err);
                });
        }
        return () => {
            if (profileSubscription) {
                supabase.removeChannel(profileSubscription)
                    .catch(err => console.error('ProfilePage: Error unsubscribing from profile', err));
            }
        };
    }, [session, fetchProfile]); // Removed isUpdatingUsername as it's mainly for form submission state

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
            // Using upsert ensures that if a profile row doesn't exist (e.g., new user first time), it will be created.
            // If it exists, it will be updated.
            // Your Supabase RLS policies must allow upsert/insert/update for authenticated users on their own profile.
            // A trigger might set created_at on insert if not provided.
            const updates = {
                id: session.user.id, // Crucial for upsert to identify the row
                username: trimmedUsername,
                updated_at: new Date().toISOString(),
                // Do not send fantasy_balance or created_at unless intentionally modifying them here
            };

            const { error } = await supabase
                .from('profiles')
                .upsert(updates, { onConflict: 'id' }) // Upsert on 'id' conflict
                .select() // Select to confirm the operation (optional but good practice)
                .single(); // If you expect one row back

            if (error) throw error;

            setProfile(prev => prev ? { ...prev, username: trimmedUsername, updated_at: updates.updated_at } : { username: trimmedUsername, fantasy_balance: 1000, updated_at: updates.updated_at, created_at: session.user?.created_at }); // Optimistic update
            toast.success('Username updated successfully!');
        } catch (error: any) {
            toast.error(`Error updating username: ${error.message}`);
        } finally {
            setIsUpdatingUsername(false);
        }
    };


    if (loading && !profile) return ( // Show loading only if profile is also not yet set (initial load)
        <div className="p-6 bg-sleeper-surface rounded-xl shadow-xl max-w-2xl mx-auto text-center border border-sleeper-border">
            <p className="text-sleeper-text-secondary text-lg">Loading profile...</p>
        </div>
    );

    if (!session || !profile) {
        return (
            <div className="p-6 bg-sleeper-surface rounded-xl shadow-xl max-w-2xl mx-auto text-center border border-sleeper-border">
                <p className="text-sleeper-text-secondary text-lg">Please log in to view your profile.</p>
                {/* Optionally, add a login button or redirect here */}
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
                            className="w-full sm:w-auto px-6 py-2.5 bg-sleeper-primary hover:bg-opacity-80 text-white font-semibold rounded-md shadow-md transition-colors duration-150 ease-in-out disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-sleeper-primary focus:ring-offset-2 focus:ring-offset-sleeper-surface"
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