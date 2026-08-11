import { useState } from 'react';
import { useAuth } from '../lib/auth';

// A simple modal for a signed-in user to set a new password (no email needed).
export function ChangePassword({ onClose }: { onClose: () => void }) {
  const { changePassword } = useAuth();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid = pw.length >= 6 && pw === pw2;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await changePassword(pw);
      setDone(true);
      setTimeout(onClose, 1400);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div className="modal card" onClick={(e) => e.stopPropagation()}>
        <h3>Change password</h3>
        {done ? (
          <p className="notice-inline">✓ Password updated.</p>
        ) : (
          <form onSubmit={submit} className="stack">
            <label htmlFor="np">New password</label>
            <input
              id="np"
              type="password"
              autoFocus
              placeholder="At least 6 characters"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
            />
            <label htmlFor="np2">Confirm new password</label>
            <input
              id="np2"
              type="password"
              placeholder="Re-type it"
              value={pw2}
              onChange={(e) => setPw2(e.target.value)}
            />
            {pw2 && pw !== pw2 && (
              <p className="muted small">Passwords don't match yet.</p>
            )}
            {error && <p className="error">{error}</p>}
            <div className="modal-actions">
              <button type="button" className="btn-sm" onClick={onClose}>
                Cancel
              </button>
              <button className="btn" disabled={!valid || busy}>
                {busy ? 'Saving…' : 'Update password'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
