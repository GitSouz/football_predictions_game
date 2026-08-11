import { useEffect, useMemo, useState } from 'react';
import { getMyPredictions, savePrediction } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { Fixture } from '../lib/types';
import { Deadline } from './Deadline';

interface Entry {
  home: string;
  away: string;
}

function fmtKickoff(iso: string | null): string {
  if (!iso) return 'TBC';
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function PredictionForm({
  leagueId,
  gameweek,
  fixtures,
  deadline,
}: {
  leagueId: string;
  gameweek: number;
  fixtures: Fixture[];
  deadline: string | null;
}) {
  const { user } = useAuth();
  const [entries, setEntries] = useState<Record<number, Entry>>({});
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>(
    'idle'
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user) return;
      const mine = await getMyPredictions(leagueId, user.id, gameweek);
      if (cancelled) return;
      const next: Record<number, Entry> = {};
      for (const p of mine) {
        next[p.fixture_id] = { home: String(p.pred_home), away: String(p.pred_away) };
      }
      setEntries(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [leagueId, gameweek, user?.id]);

  function setVal(fixtureId: number, side: 'home' | 'away', value: string) {
    const clean = value.replace(/[^0-9]/g, '').slice(0, 2);
    setEntries((prev) => ({
      ...prev,
      [fixtureId]: {
        home: side === 'home' ? clean : prev[fixtureId]?.home ?? '',
        away: side === 'away' ? clean : prev[fixtureId]?.away ?? '',
      },
    }));
    setStatus('idle');
  }

  const filledCount = useMemo(
    () =>
      Object.values(entries).filter((e) => e.home !== '' && e.away !== '').length,
    [entries]
  );

  async function saveAll() {
    setStatus('saving');
    setError(null);
    try {
      for (const f of fixtures) {
        const e = entries[f.id];
        if (!e || e.home === '' || e.away === '') continue;
        await savePrediction(leagueId, f.id, Number(e.home), Number(e.away));
      }
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 2000);
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="predict">
      <div className="predict-bar">
        <Deadline deadline={deadline} />
        <div className="predict-bar-right">
          <span className="muted small">
            {filledCount}/{fixtures.length} predicted
          </span>
          <button
            className="btn"
            onClick={saveAll}
            disabled={status === 'saving' || filledCount === 0}
          >
            {status === 'saving'
              ? 'Saving…'
              : status === 'saved'
                ? 'Saved ✓'
                : 'Save predictions'}
          </button>
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      <ul className="fixture-list">
        {fixtures.map((f) => {
          const e = entries[f.id] ?? { home: '', away: '' };
          return (
            <li key={f.id} className="fixture">
              <span className="ko">{fmtKickoff(f.kickoff_time)}</span>
              <div className="match">
                <span className="team home">{f.home_team}</span>
                <div className="score-inputs">
                  <input
                    inputMode="numeric"
                    value={e.home}
                    placeholder="–"
                    onChange={(ev) => setVal(f.id, 'home', ev.target.value)}
                    aria-label={`${f.home_team} goals`}
                  />
                  <span className="dash">-</span>
                  <input
                    inputMode="numeric"
                    value={e.away}
                    placeholder="–"
                    onChange={(ev) => setVal(f.id, 'away', ev.target.value)}
                    aria-label={`${f.away_team} goals`}
                  />
                </div>
                <span className="team away">{f.away_team}</span>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="predict-footer">
        <button
          className="btn"
          onClick={saveAll}
          disabled={status === 'saving' || filledCount === 0}
        >
          {status === 'saving' ? 'Saving…' : 'Save predictions'}
        </button>
      </div>
    </div>
  );
}
