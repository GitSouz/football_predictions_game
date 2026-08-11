import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { getProfile, upsertProfile } from './api';
import type { Profile } from './types';

interface AuthState {
  loading: boolean;
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  /** Send a magic-link / OTP email. */
  signIn: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  setDisplayName: (name: string) => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

// Fallback display name derived from an email's local part, e.g. "sam.jones".
function nameFromEmail(email: string | undefined): string {
  if (!email) return 'Player';
  const local = email.split('@')[0] ?? 'Player';
  return local.replace(/[._-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Ensure a profile row exists after sign-in, seeding a default display name.
  useEffect(() => {
    const user = session?.user;
    if (!user) {
      setProfile(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        let p = await getProfile(user.id);
        if (!p) {
          await upsertProfile(user.id, nameFromEmail(user.email));
          p = await getProfile(user.id);
        }
        if (!cancelled) setProfile(p);
      } catch {
        /* ignore — profile will be retried on next auth change */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  const value: AuthState = {
    loading,
    user: session?.user ?? null,
    session,
    profile,
    async signIn(email: string) {
      if (!supabase) throw new Error('Supabase is not configured.');
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: window.location.origin },
      });
      if (error) throw new Error(error.message);
    },
    async signOut() {
      if (!supabase) return;
      await supabase.auth.signOut();
    },
    async setDisplayName(name: string) {
      const user = session?.user;
      if (!user) return;
      await upsertProfile(user.id, name);
      setProfile(await getProfile(user.id));
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
