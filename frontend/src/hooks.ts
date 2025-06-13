// src/hooks.ts
import { useOutletContext } from 'react-router-dom';
import { type AppContextType } from './AppContext';
import { type Session } from '@supabase/supabase-js';

// Diese Hooks werden jetzt von hier exportiert, um die App.tsx sauber zu halten.
export function useAppOutletContext() {
    return useOutletContext<AppContextType>();
}

export function useAuthContext() {
    return useOutletContext<{ session: Session }>();
}