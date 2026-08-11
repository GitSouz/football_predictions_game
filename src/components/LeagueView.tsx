import { useEffect, useMemo, useState } from 'react';
import {
  getFixtures,
  getGameweeks,
  getLeagueByCode,
  refreshScores,
} from '../lib/api';
import type { Fixture, Gameweek, League } from '../lib/types';
import { navigate } from '../App';
import { PredictionForm } from './PredictionForm';
import { GameweekGrid } from './GameweekGrid';
import { Leaderboard } from './Leaderboard';

type Tab = 'week' | 'table';

// Pick a sensible default gameweek to land on: the current one, else the next,
// else the last one with fixtures.
function defaultGameweek(gws: Gameweek[]): number | null {
  if (gws.length === 0) return null;
  const cur = gws.find((g) => g.is_current);
  if (cur) return cur.id;
  const next = gws.find((g) => g.is_next);
  if (next) return next.id;
  const unfinished = gws.find((g) => !g.finished);
  return (unfinished ?? gws[gws.length - 1]).id;
}

export function LeagueView({ code }: { code: string }) {
  const [league, setLeague] = useState<League | null>(null);
  const [gameweeks, setGameweeks] = useState<Gameweek[]>([]);
  const [gw, setGw] = useState<number | null>(null);
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [tab, setTab] = useState<Tab>('week');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);

  // Load league + gameweeks once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [lg, gws] = await Promise.all([
          getLeagueByCode(code),
          getGameweeks(),
        ]);
        if (cancelled) return;
        if (!lg) {
          setError('League not found, or you are not a member of it.');
          setLoading(false);
          return;
        }
        setLeague(lg);
        setGameweeks(gws);
        setGw((prev) => prev ?? defaultGameweek(gws));
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code]);

  // Load fixtures whenever the selected gameweek changes.
  useEffect(() => {
    if (gw == null) return;
    let cancelled = false;
    (async () => {
      try {
        const fx = await getFixtures(gw);
        if (!cancelled) setFixtures(fx);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [gw]);

  const currentGw = useMemo(
    () => gameweeks.find((g) => g.id === gw) ?? null,
    [gameweeks, gw]
  );

  const locked = useMemo(() => {
    if (!currentGw) return false;
    return new Date(currentGw.deadline_time).getTime() <= Date.now();
  }, [currentGw]);

  // Once a gameweek is locked, matches are (or will be) in play. Until every
  // fixture is finished, quietly re-sync results in the background so the table
  // moves live — this is what keeps scores current on Vercel's free plan, where
  // the cron only runs once a day.
  const allFinished = useMemo(
    () => fixtures.length > 0 && fixtures.every((f) => f.finished),
    [fixtures]
  );

  useEffect(() => {
    if (gw == null || !locked || allFinished) return;
    let cancelled = false;
    const tick = async () => {
      await refreshScores();
      if (cancelled || gw == null) return;
      const [gws, fx] = await Promise.all([getGameweeks(), getFixtures(gw)]);
      if (cancelled) return;
      setGameweeks(gws);
      setFixtures(fx);
    };
    const id = setInterval(tick, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [gw, locked, allFinished]);

  async function onRefresh() {
    setRefreshing(true);
    const res = await refreshScores();
    // Always reload gameweeks after a sync. On a cold start the league opened
    // with an empty database, so there was no selected gameweek yet — pick a
    // sensible default now that the data exists, then load its fixtures.
    const gws = await getGameweeks();
    setGameweeks(gws);
    const targetGw = gw ?? defaultGameweek(gws);
    if (targetGw != null) {
      if (targetGw !== gw) setGw(targetGw);
      setFixtures(await getFixtures(targetGw));
    }
    setRefreshing(false);
    if (res == null) {
      setError(
        'Could not refresh live scores. The sync endpoint may not be deployed ' +
          'yet, or the FPL API is updating — the scheduled job will retry.'
      );
    } else {
      setError(null);
    }
  }

  function copyCode() {
    navigator.clipboard?.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  if (loading) return <div className="card">Loading league…</div>;
  if (error && !league)
    return (
      <div className="card">
        <p className="error">{error}</p>
        <button className="btn-ghost" onClick={() => navigate('#/')}>
          ← Back to your leagues
        </button>
      </div>
    );
  if (!league) return null;

  return (
    <div className="league">
      <div className="league-head">
        <div>
          <button className="back" onClick={() => navigate('#/')}>
            ← Leagues
          </button>
          <h2>{league.name}</h2>
        </div>
        <button className="code-chip" onClick={copyCode} title="Copy join code">
          {copied ? 'Copied!' : `Code: ${league.code}`}
        </button>
      </div>

      <div className="league-controls">
        <div className="tabs">
          <button
            className={tab === 'week' ? 'tab active' : 'tab'}
            onClick={() => setTab('week')}
          >
            Gameweek
          </button>
          <button
            className={tab === 'table' ? 'tab active' : 'tab'}
            onClick={() => setTab('table')}
          >
            Table
          </button>
        </div>

        {tab === 'week' && gameweeks.length > 0 && (
          <div className="gw-nav">
            <select
              value={gw ?? ''}
              onChange={(e) => setGw(Number(e.target.value))}
            >
              {gameweeks.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                  {g.is_current ? ' • live' : g.finished ? ' • done' : ''}
                </option>
              ))}
            </select>
            <button className="btn-sm" onClick={onRefresh} disabled={refreshing}>
              {refreshing ? 'Refreshing…' : '↻ Refresh scores'}
            </button>
          </div>
        )}
      </div>

      {error && <p className="error">{error}</p>}

      {tab === 'table' ? (
        <Leaderboard leagueId={league.id} />
      ) : gameweeks.length === 0 || fixtures.length === 0 ? (
        <div className="card notice">
          <p>
            No fixtures loaded for this gameweek yet. The scheduled sync pulls
            them from the live Premier League feed every few minutes — or hit{' '}
            <strong>↻ Refresh scores</strong> to pull them now.
          </p>
          <button className="btn" onClick={onRefresh} disabled={refreshing}>
            {refreshing ? 'Refreshing…' : 'Load fixtures now'}
          </button>
        </div>
      ) : locked ? (
        <GameweekGrid
          leagueId={league.id}
          gameweek={gw as number}
          fixtures={fixtures}
          deadline={currentGw?.deadline_time ?? null}
        />
      ) : (
        <PredictionForm
          leagueId={league.id}
          gameweek={gw as number}
          fixtures={fixtures}
          deadline={currentGw?.deadline_time ?? null}
        />
      )}
    </div>
  );
}
