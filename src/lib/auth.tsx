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
  signIn: (username: string, password: string) => Promise<void>;
  signUp: (username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  setDisplayName: (name: string) => Promise<void>;
  changePassword: (newPassword: string) => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

// Supabase Auth is email-based, but we never send email. Each username is
// mapped to a stable synthetic address so Supabase can key the account on it.
// The domain doesn't have to exist — no mail is ever delivered to it.
const EMAIL_DOMAIN = 'players.predictions.local';

/** Normalise a username to its synthetic login email (case-insensitive). */
export function usernameToEmail(username: string): string {
  const slug = username.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '');
  return `${slug}@${EMAIL_DOMAIN}`;
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

  // Load the profile (display name) for the signed-in user.
  useEffect(() => {
    const user = session?.user;
    if (!user) {
      setProfile(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const p = await getProfile(user.id);
        if (!cancelled) setProfile(p);
      } catch {
        /* ignore — retried on next auth change */
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

    async signUp(username: string, password: string) {
      if (!supabase) throw new Error('Supabase is not configured.');
      const email = usernameToEmail(username);
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) throw new Error(error.message);

      // With email confirmation OFF, sign-up returns a session immediately.
      const u = data.user ?? data.session?.user;
      if (u && data.session) {
        await upsertProfile(u.id, username.trim());
        try {
          setProfile(await getProfile(u.id));
        } catch {
          /* profile will load on the auth-change effect */
        }
        return;
      }

      // No session came back. Either the username is taken, or email
      // confirmation is still switched ON in Supabase. Try to sign in — if the
      // password matches an existing account this logs them in; otherwise we
      // surface a clear message.
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInErr) {
        throw new Error(
          'That username may already be taken. If it’s yours, use “Sign in”. ' +
            'If you just created it and nothing happened, make sure “Confirm ' +
            'email” is turned OFF in your Supabase Auth settings.'
        );
      }
    },

    async signIn(username: string, password: string) {
      if (!supabase) throw new Error('Supabase is not configured.');
      const email = usernameToEmail(username);
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
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

    async changePassword(newPassword: string) {
      if (!supabase) throw new Error('Supabase is not configured.');
      // A valid session is required; Supabase updates the current user's
      // password directly (no email round-trip).
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (error) throw new Error(error.message);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
