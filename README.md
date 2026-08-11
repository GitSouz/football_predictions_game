# ⚽ Premier League Score Predictions

A little web app for a group of friends to predict Premier League scorelines
each gameweek. Points are worked out **automatically** from live match data —
no spreadsheets, no manual scoring.

> **Scoring:** **3 points** for the exact score (you said 3-1, it finished 3-1),
> **1 point** for the correct result (right winner, or you both said "a draw"),
> **0** otherwise.

## How it plays

1. One person **creates a league** and shares the 6-character code.
2. Everyone **picks a username + password** (no email needed) and **joins**
   with the code.
3. Each gameweek, everyone **predicts every fixture**. You can edit right up to
   the **gameweek deadline** (the first kickoff), then predictions **lock**.
4. As matches are played, results are pulled in automatically and the
   **table updates itself**. Once a gameweek locks, everyone can see everyone
   else's predictions and how they're scoring.

## The stack (same shape as `fpl_draft`)

- **Vite + React + TypeScript** single-page app
- **Supabase** — Postgres + Auth (username + password, no email) + Row-Level Security +
  Realtime. All the game logic and the fairness rules (predictions stay hidden
  until lock; no editing after the deadline) are enforced in the database, not
  just the UI.
- **Vercel** — hosts the app and runs a daily **Cron job** that fetches results
  from the **official FPL API** and writes them to Supabase (no paid football API
  or key required). During matches, the app itself re-syncs every 60 seconds
  while a locked gameweek is open, so scores move live even on Vercel's free
  plan (whose cron is limited to once per day). On Vercel Pro you can bump the
  cron to every few minutes for always-on scoring.

```
Browser ──► Supabase (leagues, predictions, results, auth)
   ▲                       ▲
   │                       │ service-role writes
   └── Vercel Cron ──► /api/cron/sync ──► FPL API (live scores)
```

## Points & fairness, enforced in the database

- **Scoring** lives in one SQL view (`prediction_scores`) and is mirrored in
  `src/lib/scoring.ts` for the live UI. One rule, one place.
- **Predictions are private until lock.** Row-Level Security only reveals other
  players' predictions for a gameweek *after* its deadline.
- **No late edits.** The `upsert_prediction` function re-checks the deadline
  server-side, so a prediction can't be saved or changed once the gameweek is
  locked — even via the API directly.
- **Results can't be forged.** Only the server-side cron (service-role key) can
  write to the `fixtures` / `gameweeks` tables. Clients can read them but never
  write them.

## Set it up

The one-time setup (Supabase project + Vercel deploy, ~20–30 min) is in
[`docs/SETUP.md`](docs/SETUP.md).

## Run locally

```bash
npm install
cp .env.example .env      # fill in your Supabase URL + anon key
npm run dev
```

Plain `vite` serves the app but **not** the `/api/cron/sync` function. To
exercise live-score syncing locally, run the app under Vercel's dev server
(`npm i -g vercel && vercel dev`) with the server env vars set, or just deploy
and use the **↻ Refresh scores** button.

## Project layout

```
api/cron/sync.js                 Vercel Cron: FPL API → Supabase (service role)
supabase/migrations/0001_init.sql  Schema, RLS, scoring view, RPCs — run once
src/lib/                         supabase client, auth, api, types, scoring rule
src/components/                  Auth, Dashboard, LeagueView, PredictionForm,
                                 GameweekGrid (locked view), Leaderboard
docs/SETUP.md                    Full deployment walkthrough
```
