import { useEffect, useState } from 'react';
import { getStandings } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { Standing } from '../lib/types';

// Season standings — totals across every scored gameweek. Driven by the
// `league_standings` view, so it always reflects the latest synced results.
export function Leaderboard({ leagueId }: { leagueId: string }) {
  const { user } = useAuth();
  const [rows, setRows] = useState<Standing[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await getStandings(leagueId);
        if (!cancelled) setRows(s);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [leagueId]);

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
                <td className="rank">
                  {i === 0 ? '🏆' : i + 1}
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
