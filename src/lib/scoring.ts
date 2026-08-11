import type { Fixture } from './types';

// The single source of truth for the game's scoring rule, mirrored from the
// SQL in supabase/migrations/0001_init.sql so the UI can show points (including
// a live "if it ended now" tally) without a round-trip.
//
//   3 points — exact score
//   1 point  — correct result (right winner, or a draw predicted as any draw)
//   0        — otherwise

export type Outcome = 'H' | 'D' | 'A';

export function outcome(home: number, away: number): Outcome {
  if (home > away) return 'H';
  if (home < away) return 'A';
  return 'D';
}

/** Points for one prediction against one actual scoreline. */
export function scorePrediction(
  predHome: number,
  predAway: number,
  actualHome: number,
  actualAway: number
): number {
  if (predHome === actualHome && predAway === actualAway) return 3;
  if (outcome(predHome, predAway) === outcome(actualHome, actualAway)) return 1;
  return 0;
}

/**
 * Points for a prediction against a fixture. Returns null when the fixture has
 * no usable score yet (not started / no data). `includeLive` counts in-progress
 * matches as a provisional tally based on the current score.
 */
export function pointsForFixture(
  predHome: number,
  predAway: number,
  fixture: Fixture,
  includeLive = false
): number | null {
  const hasScore = fixture.home_score != null && fixture.away_score != null;
  if (!hasScore) return null;
  const counts = fixture.finished || (includeLive && fixture.started);
  if (!counts) return null;
  return scorePrediction(
    predHome,
    predAway,
    fixture.home_score as number,
    fixture.away_score as number
  );
}
