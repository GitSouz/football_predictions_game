import { useEffect, useState } from 'react';

// A live countdown to the moment predictions lock. With per-fixture locking the
// relevant moment is the NEXT game's kick-off, so the label is configurable.
export function Deadline({
  deadline,
  label = 'Locks in',
  tbc = 'Deadline: TBC',
}: {
  deadline: string | null;
  label?: string;
  tbc?: string;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  if (!deadline) return <span className="deadline muted">{tbc}</span>;

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
    <span className="deadline open" title="Each game locks at its kick-off">
      ⏳ {label} {parts}
    </span>
  );
}
