// Vercel serverless function (plain JS so Vercel runs it directly without
// touching the frontend tsconfig). It pulls live Premier League data from the
// official FPL API and writes it into Supabase using the SERVICE ROLE key,
// which bypasses row-level security. This is the only thing that writes to the
// gameweeks/fixtures tables.
//
// Runs on a schedule (see vercel.json `crons`), and can also be triggered
// on-demand by the app's "Refresh scores" button (same endpoint).
//
// Required env vars (set in Vercel → Project Settings → Environment Variables):
//   SUPABASE_URL                (or falls back to VITE_SUPABASE_URL)
//   SUPABASE_SERVICE_ROLE_KEY   (server-only secret — never prefix with VITE_)
// Optional:
//   CRON_SECRET  — if set, callers must send it as `Authorization: Bearer ...`
//                  (Vercel Cron does this automatically).

import { createClient } from '@supabase/supabase-js';

// The FPL API sits behind Cloudflare, which 403s requests that don't look like
// a real browser. Send a full, current browser header set.
const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  Referer: 'https://fantasy.premierleague.com/',
  Origin: 'https://fantasy.premierleague.com',
};

async function fpl(path) {
  const res = await fetch(`https://fantasy.premierleague.com/api/${path}`, {
    headers: BROWSER_HEADERS,
  });
  if (!res.ok) {
    throw new Error(`FPL ${path} responded ${res.status} ${res.statusText}`);
  }
  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('json')) {
    throw new Error(`FPL ${path} returned non-JSON (the game may be updating)`);
  }
  return res.json();
}

export default async function handler(req, res) {
  // Optional shared-secret gate.
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.authorization || '';
    if (auth !== `Bearer ${secret}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return res.status(500).json({
      error:
        'Server not configured: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.',
    });
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false },
  });

  try {
    // 1) Teams + gameweeks (events) come from bootstrap-static.
    const boot = await fpl('bootstrap-static/');
    const teamById = new Map();
    for (const t of boot.teams) teamById.set(t.id, t);

    const gameweeks = boot.events.map((e) => ({
      id: e.id,
      name: e.name,
      deadline_time: e.deadline_time,
      is_current: !!e.is_current,
      is_next: !!e.is_next,
      finished: !!e.finished,
    }));

    // 2) All fixtures for the season, with live/finished scores.
    const rawFixtures = await fpl('fixtures/');
    const fixtures = rawFixtures
      .filter((f) => f.event != null) // skip fixtures not yet assigned a gameweek
      .map((f) => {
        const home = teamById.get(f.team_h);
        const away = teamById.get(f.team_a);
        return {
          id: f.id,
          gameweek: f.event,
          kickoff_time: f.kickoff_time,
          home_team_id: f.team_h,
          away_team_id: f.team_a,
          home_team: home ? home.name : `Team ${f.team_h}`,
          away_team: away ? away.name : `Team ${f.team_a}`,
          home_short: home ? home.short_name : '???',
          away_short: away ? away.short_name : '???',
          home_score: f.team_h_score,
          away_score: f.team_a_score,
          started: !!f.started,
          finished: !!f.finished,
          updated_at: new Date().toISOString(),
        };
      });

    // 3) Upsert. Gameweeks first (fixtures reference them).
    const gwRes = await supabase
      .from('gameweeks')
      .upsert(gameweeks, { onConflict: 'id' });
    if (gwRes.error) throw new Error(`gameweeks upsert: ${gwRes.error.message}`);

    const fxRes = await supabase
      .from('fixtures')
      .upsert(fixtures, { onConflict: 'id' });
    if (fxRes.error) throw new Error(`fixtures upsert: ${fxRes.error.message}`);

    return res.status(200).json({
      ok: true,
      gameweeks: gameweeks.length,
      fixtures: fixtures.length,
      synced_at: new Date().toISOString(),
    });
  } catch (err) {
    return res.status(502).json({
      error: 'Sync failed',
      detail: err && err.message ? err.message : String(err),
    });
  }
}
