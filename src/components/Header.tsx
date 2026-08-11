import { useState } from 'react';
import { useAuth } from '../lib/auth';
import { navigate } from '../App';
import { ChangePassword } from './ChangePassword';

export function Header() {
  const { user, profile, signOut, setDisplayName } = useAuth();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [showPw, setShowPw] = useState(false);

  async function save() {
    const trimmed = name.trim();
    if (trimmed) await setDisplayName(trimmed);
    setEditing(false);
  }

  return (
    <header className="topbar">
      <button
        className="brand"
        onClick={() => navigate('#/')}
        aria-label="Home"
      >
        <span className="brand-mark">⚽</span>
        <span className="brand-name">Score Predictions</span>
      </button>

      {user && (
        <div className="topbar-right">
          {editing ? (
            <span className="name-edit">
              <input
                autoFocus
                value={name}
                placeholder={profile?.display_name ?? 'Your name'}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && save()}
              />
              <button className="btn-sm" onClick={save}>
                Save
              </button>
            </span>
          ) : (
            <button
              className="who"
              title="Edit your display name"
              onClick={() => {
                setName(profile?.display_name ?? '');
                setEditing(true);
              }}
            >
              {profile?.display_name ?? 'Player'}
            </button>
          )}
          <button
            className="btn-ghost icon-btn"
            title="Change password"
            aria-label="Change password"
            onClick={() => setShowPw(true)}
          >
            🔑
          </button>
          <button className="btn-ghost" onClick={signOut}>
            Sign out
          </button>
        </div>
      )}

      {showPw && <ChangePassword onClose={() => setShowPw(false)} />}
    </header>
  );
}
