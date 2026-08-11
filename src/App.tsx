import { useEffect, useState } from 'react';
import { configured } from './lib/supabase';
import { useAuth } from './lib/auth';
import { Header } from './components/Header';
import { Auth } from './components/Auth';
import { Dashboard } from './components/Dashboard';
import { LeagueView } from './components/LeagueView';

// Minimal hash router. Routes:
//   #/                  -> dashboard
//   #/league/<CODE>     -> a league
function useHashRoute(): string {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return hash;
}

export function navigate(path: string) {
  window.location.hash = path;
}

function NotConfigured() {
  return (
    <div className="card notice">
      <h2>Almost there — connect Supabase</h2>
      <p>
        This app needs a Supabase project to store leagues, predictions and
        results. Set <code>VITE_SUPABASE_URL</code> and{' '}
        <code>VITE_SUPABASE_ANON_KEY</code> (locally in <code>.env</code>, or in
        your Vercel project settings) and reload.
      </p>
      <p>
        See <code>docs/SETUP.md</code> for the full 20-minute walkthrough.
      </p>
    </div>
  );
}

export default function App() {
  const hash = useHashRoute();
  const { loading, user } = useAuth();

  let body;
  if (!configured) {
    body = <NotConfigured />;
  } else if (loading) {
    body = <div className="card">Loading…</div>;
  } else if (!user) {
    body = <Auth />;
  } else {
    const match = hash.match(/^#\/league\/([A-Za-z0-9]+)/);
    body = match ? <LeagueView code={match[1].toUpperCase()} /> : <Dashboard />;
  }

  return (
    <div className="app">
      <Header />
      <main className="container">{body}</main>
      <footer className="footer">
        <span>Scores update automatically from live Premier League data.</span>
      </footer>
    </div>
  );
}
