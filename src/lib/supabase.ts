import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Normalise the URL to the bare project origin. The client appends
// "/rest/v1/..." itself, so a trailing slash or an accidental "/rest/v1"
// suffix produces a malformed path the Supabase gateway rejects.
const url = import.meta.env.VITE_SUPABASE_URL?.trim()
  .replace(/\/+$/, '')
  .replace(/\/rest\/v1$/, '')
  .replace(/\/+$/, '');
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

/** Whether the app is wired up to a Supabase project. */
export const configured = Boolean(url && anonKey);

export const supabase: SupabaseClient | null = configured
  ? createClient(url as string, anonKey as string, {
      auth: {
        // Persist the session so a magic-link login survives refreshes and the
        // user stays signed in across the season.
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
      realtime: { params: { eventsPerSecond: 5 } },
    })
  : null;

/** Narrowing helper: returns a non-null client or throws a clear error. */
export function db(): SupabaseClient {
  if (!supabase) {
    throw new Error('Supabase is not configured (missing env vars).');
  }
  return supabase;
}
