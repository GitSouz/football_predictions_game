import { useEffect, useState } from 'react';
import { createLeague, joinLeague, myLeagues, getLeagueByCode } from '../lib/api';
import type { League } from '../lib/types';
import { navigate } from '../App';

export function Dashboard() {
  const [leagues, setLeagues] = useState<League[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      setLeagues(await myLeagues());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const { code } = await createLeague(newName);
      setNewName('');
      await load();
      navigate(`#/league/${code}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function onJoin(e: React.FormEvent) {
    e.preventDefault();
    if (!joinCode.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await joinLeague(joinCode);
      const league = await getLeagueByCode(joinCode);
      setJoinCode('');
      await load();
      if (league) navigate(`#/league/${league.code}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dashboard">
      <section className="card">
        <h2>Your leagues</h2>
        {leagues === null ? (
          <p className="muted">Loading…</p>
        ) : leagues.length === 0 ? (
          <p className="muted">
            You're not in any leagues yet. Create one and share the code, or
            join a friend's league below.
          </p>
        ) : (
          <ul className="league-list">
            {leagues.map((l) => (
              <li key={l.id}>
                <button
                  className="league-row"
                  onClick={() => navigate(`#/league/${l.code}`)}
                >
                  <span className="league-name">{l.name}</span>
                  <span className="league-code">{l.code}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="two-col">
        <section className="card">
          <h3>Create a league</h3>
          <form onSubmit={onCreate} className="stack">
            <input
              placeholder="League name (e.g. The Lads)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <button className="btn" disabled={busy || !newName.trim()}>
              Create
            </button>
          </form>
          <p className="muted small">
            You'll get a 6-character code to share with your friends.
          </p>
        </section>

        <section className="card">
          <h3>Join a league</h3>
          <form onSubmit={onJoin} className="stack">
            <input
              placeholder="Enter code (e.g. 9F2AB1)"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              maxLength={6}
              style={{ textTransform: 'uppercase', letterSpacing: '0.15em' }}
            />
            <button className="btn" disabled={busy || !joinCode.trim()}>
              Join
            </button>
          </form>
        </section>
      </div>

      {error && <p className="error">{error}</p>}
    </div>
  );
}
