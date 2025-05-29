// frontend/src/components/ProfilePage.tsx
import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { useAuthContext } from '../App';
import { toast } from 'react-toastify';
import type { User } from '@supabase/supabase-js'; // Corrected: type-only import
import { ArrowPathIcon } from '@heroicons/react/20/solid';

interface ProfileData { username: string | null; fantasy_balance: number | null; created_at?: string; updated_at?: string; }

const ProfilePage: React.FC = () => {
    const { session } = useAuthContext();
    const [loading, setLoading] = useState(true);
    const [profile, setProfile] = useState<ProfileData | null>(null);
    const [usernameInput, setUsernameInput] = useState('');
    const [isUpdatingUsername, setIsUpdatingUsername] = useState(false);

    const createDefaultProfileView = (authUser: User): ProfileData => ({ username: authUser.email?.split('@')[0] || `Player${authUser.id.substring(0,4)}`, fantasy_balance: 1000, created_at: authUser.created_at });
    const fetchProfile = useCallback(async () => {
        if (!session?.user) { setLoading(false); setProfile(null); return; } setLoading(true);
        try { const { data, error } = await supabase.from('profiles').select('username,fantasy_balance,created_at').eq('id', session.user.id).single();
            if (error) { if (error.code === 'PGRST116') { const dV = createDefaultProfileView(session.user); setProfile(dV); setUsernameInput(dV.username || ''); toast.info("Welcome! Set your username."); } else throw error; }
            else if (data) { setProfile({...data,created_at:data.created_at||session.user.created_at}); setUsernameInput(data.username||''); }
            else { const dV = createDefaultProfileView(session.user); setProfile(dV); setUsernameInput(dV.username||''); }
        } catch (e:any) { console.error(`Err fetch profile:`,e); toast.error(`Err: ${e.message}`); if(session?.user){const dV=createDefaultProfileView(session.user);setProfile(dV);setUsernameInput(dV.username||'');}}
        finally { setLoading(false); }
    }, [session]);

    useEffect(() => {
        fetchProfile(); let pSub:any=null; if(session?.user){pSub=supabase.channel(`profiles-page-${session.user.id}`).on('postgres_changes',{event:'*',schema:'public',table:'profiles',filter:`id=eq.${session.user.id}`},(p)=>{const nR=p.new as ProfileData;setProfile(curr=>{const bCA=curr?.created_at||session.user?.created_at;return{username:nR.username,fantasy_balance:nR.fantasy_balance,created_at:nR.created_at||bCA,updated_at:nR.updated_at};});if(nR.username&&usernameInput!==nR.username&&!document.hasFocus()){setUsernameInput(nR.username);}}).subscribe((s,e)=>{if(s==='SUBSCRIBED')console.log('ProfilePage:Subbed.');if(e)console.error('ProfilePage:SubErr',e);});} return()=>{if(pSub)supabase.removeChannel(pSub).catch(console.error);};
    }, [session, fetchProfile]); // fetchProfile is now a dependency

    const handleUsernameUpdate = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault(); const trimUser = usernameInput.trim(); if (!session?.user || !trimUser) { toast.warn("Username empty."); return; } if (profile && trimUser === profile.username) { toast.info("Username is already set."); return; } setIsUpdatingUsername(true); try { const updates = {id: session.user.id, username: trimUser, updated_at: new Date().toISOString()}; const { error } = await supabase.from('profiles').upsert(updates, { onConflict: 'id' }).select().single(); if (error) throw error; setProfile(prev => prev ? { ...prev, username: trimUser, updated_at: updates.updated_at } : { username: trimUser, fantasy_balance: 1000, updated_at: updates.updated_at, created_at: session.user?.created_at }); toast.success('Username updated!'); } catch (error: any) { toast.error(`Error updating username: ${error.message}`); } finally { setIsUpdatingUsername(false); }
    };

    if (loading && !profile) return (<div className="p-6 bg-sleeper-surface-100 rounded-xl shadow-xl max-w-2xl mx-auto text-center border border-sleeper-border flex flex-col items-center justify-center min-h-[200px]"><ArrowPathIcon className="h-8 w-8 text-sleeper-primary animate-spin mb-3" /><p className="text-sleeper-text-secondary text-lg">Loading profile...</p></div>);
    if (!session || !profile) return (<div className="p-6 bg-sleeper-surface-100 rounded-xl shadow-xl max-w-2xl mx-auto text-center border border-sleeper-border"><p className="text-sleeper-text-secondary text-lg">Please log in to view your profile.</p></div>);

    return (
        <div className="p-4 sm:p-8 bg-sleeper-surface-100 rounded-xl shadow-2xl max-w-2xl mx-auto border border-sleeper-border">
            <h1 className="text-3xl font-bold text-sleeper-primary mb-8 pb-4 border-b border-sleeper-border">Your Profile</h1>
            <div className="space-y-8">
                <section>
                    <h2 className="text-xl font-semibold text-sleeper-text-primary mb-4">Account Information</h2>
                    <div className="bg-sleeper-surface-200 p-4 sm:p-6 rounded-lg space-y-4 shadow-md border border-sleeper-border/50">
                        {[ { label: 'Email:', value: session.user?.email, breakAll: true }, { label: 'User ID:', value: session.user?.id, textSize: 'text-xs', breakAll: true }, { label: 'Joined:', value: profile.created_at ? new Date(profile.created_at).toLocaleDateString() : 'N/A' }, { label: 'Balance:', value: `$${profile.fantasy_balance?.toFixed(2) ?? '0.00'}`, valueClass: 'text-sleeper-success font-semibold text-xl' } ].map(item => ( <div key={item.label} className="flex flex-col sm:flex-row sm:items-center"><span className="font-medium text-sleeper-text-secondary w-full sm:w-28 shrink-0 mb-1 sm:mb-0">{item.label}</span><span className={`text-sleeper-text-primary ${item.textSize || 'text-sm'} ${item.valueClass || ''} ${item.breakAll ? 'break-all' : ''}`}>{item.value}</span></div>))}
                    </div>
                </section>
                <section>
                    <h2 className="text-xl font-semibold text-sleeper-text-primary mb-4">Update Username</h2>
                    <form onSubmit={handleUsernameUpdate} className="bg-sleeper-surface-200 p-4 sm:p-6 rounded-lg space-y-4 shadow-md border border-sleeper-border/50">
                        <div><label htmlFor="username" className="block text-sm font-medium text-sleeper-text-secondary mb-1.5">Display Name</label><input type="text" id="username" value={usernameInput} onChange={(e) => setUsernameInput(e.target.value)} className="w-full px-4 py-2.5 bg-sleeper-bg text-sleeper-text-primary border-sleeper-border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-sleeper-primary focus:border-sleeper-primary sm:text-sm" placeholder="Enter your display name" disabled={isUpdatingUsername} /></div>
                        <button type="submit" className="w-full sm:w-auto px-6 py-2.5 bg-sleeper-primary hover:bg-sleeper-primary-hover text-sleeper-text-on-primary font-semibold rounded-md shadow-md transition-colors duration-150 ease-in-out disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-sleeper-primary focus:ring-offset-2 focus:ring-offset-sleeper-surface-200" disabled={isUpdatingUsername || !usernameInput.trim() || (profile && usernameInput.trim() === profile.username)}>{isUpdatingUsername?(<span className="flex items-center justify-center"><ArrowPathIcon className="animate-spin h-5 w-5 mr-2"/>Saving...</span>):'Save Username'}</button>
                    </form>
                </section>
            </div>
        </div>
    );
};
export default ProfilePage;