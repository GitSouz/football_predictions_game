import { useState } from 'react';
import { useAuth } from '../lib/auth';

export function Auth() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await signIn(email);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="card auth-card">
        <h1 className="auth-title">Premier League Score Predictions</h1>
        <p className="auth-sub">
          Predict every scoreline each gameweek. Get <strong>3 points</strong>{' '}
          for the exact score and <strong>1 point</strong> for the right result.
          Winners settled automatically from live data.
        </p>

        {sent ? (
          <div className="notice-inline">
            <p>
              ✉️ Check <strong>{email}</strong> for a sign-in link. Open it on
              this device to log in — no password needed.
            </p>
            <button className="btn-ghost" onClick={() => setSent(false)}>
              Use a different email
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="auth-form">
            <label htmlFor="email">Sign in with your email</label>
            <input
              id="email"
              type="email"
              required
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button className="btn" disabled={busy || !email.trim()}>
              {busy ? 'Sending…' : 'Send me a login link'}
            </button>
            {error && <p className="error">{error}</p>}
          </form>
        )}
      </div>
    </div>
  );
}
