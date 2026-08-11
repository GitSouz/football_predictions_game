import { useState } from 'react';
import { useAuth } from '../lib/auth';

type Mode = 'signin' | 'signup';

// Turn Supabase's raw auth errors into friendly messages.
function friendly(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials'))
    return 'Wrong username or password.';
  if (m.includes('user already registered'))
    return 'That username is taken — try signing in instead.';
  if (m.includes('password should be'))
    return 'Password must be at least 6 characters.';
  return message;
}

export function Auth() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<Mode>('signin');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validUsername = /^[a-zA-Z0-9._-]{2,20}$/.test(username.trim());
  const validPassword = password.length >= 6;
  const canSubmit = validUsername && validPassword && !busy;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'signup') await signUp(username, password);
      else await signIn(username, password);
    } catch (err) {
      setError(friendly(err instanceof Error ? err.message : String(err)));
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

        <div className="tabs auth-tabs">
          <button
            type="button"
            className={mode === 'signin' ? 'tab active' : 'tab'}
            onClick={() => {
              setMode('signin');
              setError(null);
            }}
          >
            Sign in
          </button>
          <button
            type="button"
            className={mode === 'signup' ? 'tab active' : 'tab'}
            onClick={() => {
              setMode('signup');
              setError(null);
            }}
          >
            Create account
          </button>
        </div>

        <form onSubmit={submit} className="auth-form">
          <label htmlFor="username">Username</label>
          <input
            id="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="e.g. andy_d"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />

          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            placeholder="At least 6 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <button className="btn" disabled={!canSubmit}>
            {busy
              ? 'Please wait…'
              : mode === 'signup'
                ? 'Create account'
                : 'Sign in'}
          </button>

          {mode === 'signup' && username && !validUsername && (
            <p className="muted small">
              Username: 2–20 characters, letters/numbers and . _ - only.
            </p>
          )}
          {error && <p className="error">{error}</p>}
        </form>

        <p className="muted small auth-foot">
          {mode === 'signin' ? (
            <>
              New here?{' '}
              <button className="linklike" onClick={() => setMode('signup')}>
                Create an account
              </button>
            </>
          ) : (
            <>
              Already have one?{' '}
              <button className="linklike" onClick={() => setMode('signin')}>
                Sign in
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
