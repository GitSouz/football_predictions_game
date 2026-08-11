import { db } from './supabase';
import type {
  Fixture,
  Gameweek,
  League,
  Prediction,
  Profile,
  Standing,
} from './types';

// --- Profile ---------------------------------------------------------------

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await db()
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Profile) ?? null;
}

export async function upsertProfile(
  userId: string,
  displayName: string
): Promise<void> {
  const { error } = await db()
    .from('profiles')
    .upsert({ id: userId, display_name: displayName.trim() }, { onConflict: 'id' });
  if (error) throw new Error(error.message);
}

// --- Leagues ---------------------------------------------------------------

export async function createLeague(
  name: string
): Promise<{ league_id: string; code: string }> {
  const { data, error } = await db().rpc('create_league', { _name: name });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  return row as { league_id: string; code: string };
}

export async function joinLeague(code: string): Promise<string> {
  const { data, error } = await db().rpc('join_league', { _code: code });
  if (error) throw new Error(error.message);
  return data as string; // league id
}

export async function myLeagues(): Promise<League[]> {
  const { data, error } = await db()
    .from('leagues')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data as League[]) ?? [];
}

export async function getLeagueByCode(code: string): Promise<League | null> {
  const { data, error } = await db()
    .from('leagues')
    .select('*')
    .eq('code', code.toUpperCase())
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as League) ?? null;
}

/** League members with their display names, ordered by name. */
export async function getMembersWithNames(
  leagueId: string
): Promise<{ user_id: string; display_name: string }[]> {
  const { data: members, error: mErr } = await db()
    .from('league_members')
    .select('user_id')
    .eq('league_id', leagueId);
  if (mErr) throw new Error(mErr.message);
  const ids = (members ?? []).map((m: { user_id: string }) => m.user_id);
  if (ids.length === 0) return [];

  const { data: profiles, error: pErr } = await db()
    .from('profiles')
    .select('id, display_name')
    .in('id', ids);
  if (pErr) throw new Error(pErr.message);

  return (profiles ?? [])
    .map((p: { id: string; display_name: string }) => ({
      user_id: p.id,
      display_name: p.display_name,
    }))
    .sort((a, b) => a.display_name.localeCompare(b.display_name));
}

// --- Gameweeks & fixtures --------------------------------------------------

export async function getGameweeks(): Promise<Gameweek[]> {
  const { data, error } = await db()
    .from('gameweeks')
    .select('*')
    .order('id', { ascending: true });
  if (error) throw new Error(error.message);
  return (data as Gameweek[]) ?? [];
}

export async function getFixtures(gameweek: number): Promise<Fixture[]> {
  const { data, error } = await db()
    .from('fixtures')
    .select('*')
    .eq('gameweek', gameweek)
    .order('kickoff_time', { ascending: true });
  if (error) throw new Error(error.message);
  return (data as Fixture[]) ?? [];
}

// --- Predictions -----------------------------------------------------------

/** The signed-in user's own predictions for a gameweek in a league. */
export async function getMyPredictions(
  leagueId: string,
  userId: string,
  gameweek: number
): Promise<Prediction[]> {
  const { data, error } = await db()
    .from('predictions')
    .select('*')
    .eq('league_id', leagueId)
    .eq('user_id', userId)
    .eq('gameweek', gameweek);
  if (error) throw new Error(error.message);
  return (data as Prediction[]) ?? [];
}

/**
 * Every prediction in a league for a gameweek. RLS returns others' rows only
 * after the gameweek has locked, so before the deadline this yields just your
 * own — which is exactly the game-fairness behaviour we want.
 */
export async function getLeaguePredictions(
  leagueId: string,
  gameweek: number
): Promise<Prediction[]> {
  const { data, error } = await db()
    .from('predictions')
    .select('*')
    .eq('league_id', leagueId)
    .eq('gameweek', gameweek);
  if (error) throw new Error(error.message);
  return (data as Prediction[]) ?? [];
}

export async function savePrediction(
  leagueId: string,
  fixtureId: number,
  home: number,
  away: number
): Promise<void> {
  const { error } = await db().rpc('upsert_prediction', {
    _league_id: leagueId,
    _fixture_id: fixtureId,
    _home: home,
    _away: away,
  });
  if (error) throw new Error(error.message);
}

// --- Standings -------------------------------------------------------------

export async function getStandings(leagueId: string): Promise<Standing[]> {
  // league_table() lists every member (even on 0 points) and totals only
  // finished games, so the table is complete from day one without leaking
  // anyone's still-hidden predictions.
  const { data, error } = await db().rpc('league_table', {
    _league_id: leagueId,
  });
  if (error) throw new Error(error.message);
  return (data as Standing[]) ?? [];
}

// --- Live data refresh -----------------------------------------------------

/**
 * Trigger a server-side sync of results from the FPL API (same endpoint the
 * cron uses). Safe to call on demand; it's idempotent.
 */
export async function refreshScores(): Promise<{ fixtures: number } | null> {
  try {
    const res = await fetch('/api/cron/sync', { method: 'GET' });
    if (!res.ok) return null;
    return (await res.json()) as { fixtures: number };
  } catch {
    return null;
  }
}
