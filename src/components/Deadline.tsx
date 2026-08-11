import { useEffect, useState } from 'react';

// Shows a live countdown to the gameweek deadline, after which predictions lock.
export function Deadline({ deadline }: { deadline: string | null }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  if (!deadline) return <span className="deadline muted">Deadline: TBC</span>;

  const ms = new Date(deadline).getTime() - now;
  if (ms <= 0) return <span className="deadline locked">🔒 Locked</span>;

  const totalSec = Math.floor(ms / 1000);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;

  const parts =
    d > 0 ? `${d}d ${h}h ${m}m` : h > 0 ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`;

  return (
    <span className="deadline open" title="Predictions lock at the deadline">
      ⏳ Locks in {parts}
    </span>
  );
}
