import { useEffect, useMemo, useState } from 'react';
import { getStandingsMovement } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { StandingMovement } from '../lib/types';

// Position change since the previous gameweek, rendered as a small arrow.
function Movement({ delta, show }: { delta: number; show: boolean }) {
  if (!show) {
    return (
      <span className="move none" aria-label="no change yet" title="—">
        –
      </span>
    );
  }
  if (delta > 0) {
    return (
      <span className="move up" aria-label={`up ${delta}`} title={`Up ${delta}`}>
        ▲{delta}
      </span>
    );
  }
  if (delta < 0) {
    return (
      <span
        className="move down"
        aria-label={`down ${-delta}`}
        title={`Down ${-delta}`}
      >
        ▼{-delta}
      </span>
    );
  }
  return (
    <span className="move same" aria-label="no change" title="No change">
      –
    </span>
  );
}

// Season standings — totals across every scored gameweek, with a movement
// arrow showing each player's change in position since the previous gameweek.
// Driven by `league_table_movement`, so it always reflects the latest results.
export function Leaderboard({ leagueId }: { leagueId: string }) {
  const { user } = useAuth();
  const [rows, setRows] = useState<StandingMovement[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await getStandingsMovement(leagueId);
        if (!cancelled) setRows(s);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [leagueId]);

  // Map each player to how many places they've moved since last gameweek.
  // `rows` already arrives ranked by current total; we re-rank a copy by the
  // previous totals (same tie-breaks) and diff the two positions. A positive
  // delta means a climb up the table.
  const { deltaByUser, hasPrev } = useMemo(() => {
    const out = { deltaByUser: new Map<string, number>(), hasPrev: false };
    if (!rows) return out;
    out.hasPrev = rows.some((r) => r.prev_played > 0);

    const prevOrder = [...rows].sort(
      (a, b) =>
        b.prev_points - a.prev_points ||
        b.prev_exact - a.prev_exact ||
        a.display_name.localeCompare(b.display_name)
    );
    const prevPos = new Map<string, number>();
    prevOrder.forEach((r, i) => prevPos.set(r.user_id, i + 1));

    rows.forEach((r, i) => {
      const currentPos = i + 1;
      out.deltaByUser.set(r.user_id, (prevPos.get(r.user_id) ?? currentPos) - currentPos);
    });
    return out;
  }, [rows]);

  if (error) return <p className="error">{error}</p>;
  if (rows === null) return <div className="card">Loading table…</div>;

  if (rows.length === 0) {
    return (
      <div className="card notice">
        <p>
          No points yet — the table fills in as gameweeks are played and results
          come in. Get your predictions in!
        </p>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="grid-scroll">
        <table className="standings">
          <thead>
            <tr>
              <th className="rank">#</th>
              <th className="move-col" title="Movement since last gameweek">
                +/–
              </th>
              <th>Player</th>
              <th className="num" title="Predictions scored">
                P
              </th>
              <th className="num" title="Exact scorelines (3 pts)">
                Exact
              </th>
              <th className="num" title="Correct results (1 pt)">
                Result
              </th>
              <th className="num total-h">Points</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.user_id} className={r.user_id === user?.id ? 'me' : ''}>
                <td className="rank">{i === 0 ? '🏆' : i + 1}</td>
                <td className="move-col">
                  <Movement delta={deltaByUser.get(r.user_id) ?? 0} show={hasPrev} />
                </td>
                <td>{r.display_name}</td>
                <td className="num">{r.played}</td>
                <td className="num">{r.exact_scores}</td>
                <td className="num">{r.correct_results}</td>
                <td className="num total-h">{r.total_points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
