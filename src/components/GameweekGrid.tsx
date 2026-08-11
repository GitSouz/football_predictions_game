import { useEffect, useMemo, useState } from 'react';
import { getLeaguePredictions, getMembersWithNames } from '../lib/api';
import { useAuth } from '../lib/auth';
import { pointsForFixture } from '../lib/scoring';
import type { Fixture, Prediction } from '../lib/types';

function resultLabel(f: Fixture): string {
  if (f.home_score != null && f.away_score != null) {
    return `${f.home_score}-${f.away_score}`;
  }
  return f.started ? 'live' : '–';
}

// Post-deadline view: everyone's predictions for the gameweek, side by side,
// with points. Live matches count provisionally so the table moves in real time.
export function GameweekGrid({
  leagueId,
  gameweek,
  fixtures,
}: {
  leagueId: string;
  gameweek: number;
  fixtures: Fixture[];
  deadline: string | null;
}) {
  const { user } = useAuth();
  const [members, setMembers] = useState<{ user_id: string; display_name: string }[]>(
    []
  );
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [mem, preds] = await Promise.all([
          getMembersWithNames(leagueId),
          getLeaguePredictions(leagueId, gameweek),
        ]);
        if (cancelled) return;
        setMembers(mem);
        setPredictions(preds);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [leagueId, gameweek]);

  // Index: `${userId}:${fixtureId}` -> prediction.
  const byKey = useMemo(() => {
    const m = new Map<string, Prediction>();
    for (const p of predictions) m.set(`${p.user_id}:${p.fixture_id}`, p);
    return m;
  }, [predictions]);

  // Running totals per member for this gameweek (live-inclusive).
  const totals = useMemo(() => {
    const t = new Map<string, number>();
    for (const mem of members) {
      let sum = 0;
      for (const f of fixtures) {
        const p = byKey.get(`${mem.user_id}:${f.id}`);
        if (!p) continue;
        const pts = pointsForFixture(p.pred_home, p.pred_away, f, true);
        if (pts != null) sum += pts;
      }
      t.set(mem.user_id, sum);
    }
    return t;
  }, [members, fixtures, byKey]);

  if (error) return <p className="error">{error}</p>;

  return (
    <div className="grid-wrap card">
      <p className="muted small locked-note">
        🔒 This gameweek is locked — everyone's predictions are shown. Points:{' '}
        <strong>3</strong> exact score, <strong>1</strong> correct result.
      </p>
      <div className="grid-scroll">
        <table className="grid-table">
          <thead>
            <tr>
              <th className="sticky-col">Match</th>
              <th className="result-col">Result</th>
              {members.map((m) => (
                <th
                  key={m.user_id}
                  className={m.user_id === user?.id ? 'me' : ''}
                >
                  {m.display_name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {fixtures.map((f) => (
              <tr key={f.id}>
                <td className="sticky-col match-cell">
                  <span className="mini home">{f.home_short}</span>
                  <span className="mini-v">v</span>
                  <span className="mini away">{f.away_short}</span>
                </td>
                <td className="result-col">
                  <span className={f.finished ? 'result done' : 'result'}>
                    {resultLabel(f)}
                  </span>
                </td>
                {members.map((m) => {
                  const p = byKey.get(`${m.user_id}:${f.id}`);
                  if (!p) {
                    return (
                      <td key={m.user_id} className="pred empty">
                        –
                      </td>
                    );
                  }
                  const pts = pointsForFixture(p.pred_home, p.pred_away, f, true);
                  const cls =
                    pts === 3 ? 'pts3' : pts === 1 ? 'pts1' : pts === 0 ? 'pts0' : '';
                  return (
                    <td key={m.user_id} className={`pred ${cls}`}>
                      <span className="pred-score">
                        {p.pred_home}-{p.pred_away}
                      </span>
                      {pts != null && <span className="pred-pts">+{pts}</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="sticky-col">Gameweek points</td>
              <td className="result-col"></td>
              {members.map((m) => (
                <td
                  key={m.user_id}
                  className={`total ${m.user_id === user?.id ? 'me' : ''}`}
                >
                  {totals.get(m.user_id) ?? 0}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
