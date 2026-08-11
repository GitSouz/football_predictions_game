# Setup — get your predictions game live

Two free services, ~20–30 minutes the first time. Total cost: **$0**.

1. **Supabase** — the database, accounts (magic-link login), and security rules.
2. **Vercel** — hosts the site and runs the job that pulls in live scores.

---

## Part 1 — Supabase

### 1.1 Create the project
Go to <https://supabase.com>, sign up (no card needed), **New project**. Pick a
name, set a database password (you won't need it again), choose the region
closest to your friends, and create it. Wait ~2 minutes for it to provision.

### 1.2 Create the tables
Open **SQL Editor → New query**. Open
[`supabase/migrations/0001_init.sql`](../supabase/migrations/0001_init.sql) from
this repo, paste the **whole file** in, and click **Run**. You should see
"Success". This creates every table, the security rules, the scoring view, and
the game functions.

### 1.3 Turn on email login
Open **Authentication → Sign In / Providers** and make sure **Email** is
enabled. For the smoothest experience:

- Under **Email**, keep **"Confirm email"** on. Supabase sends a magic link /
  one-time code — no passwords for your friends to forget.
- (Optional) You can enable **"Enable email OTP"** so people can paste a 6-digit
  code instead of clicking the link.

> Supabase's built-in email works out of the box for a small group. If you ever
> hit its low free sending limit, add any SMTP provider under
> **Authentication → Emails → SMTP Settings**.

### 1.4 Set the redirect URL (after you have a Vercel URL — Part 2)
Come back here once deployed: **Authentication → URL Configuration** →
add your Vercel URL (e.g. `https://your-app.vercel.app`) to **Site URL** and
**Redirect URLs**. This makes the login link return people to your live site.

### 1.5 Copy your keys
Open **Project Settings → API** and copy:

| Value | Where it's used |
|-------|-----------------|
| **Project URL** (`https://xxxx.supabase.co`) | frontend + server |
| **anon public** key | frontend (browser-safe) |
| **service_role** key (under "Project API keys") | **server only** — the cron job. **Never** put this in the browser. |

---

## Part 2 — Vercel

### 2.1 Import the repo
Push this repo to your GitHub (it already is if you're reading it there). Go to
<https://vercel.com>, sign up with GitHub, **Add New → Project**, and import
`football_predictions_game`. Vercel auto-detects Vite — leave the build settings.

### 2.2 Add environment variables
Before deploying, expand **Environment Variables** and add all four:

| Name | Value | Notes |
|------|-------|-------|
| `VITE_SUPABASE_URL` | your Project URL | browser |
| `VITE_SUPABASE_ANON_KEY` | your anon public key | browser |
| `SUPABASE_URL` | your Project URL | server (cron) |
| `SUPABASE_SERVICE_ROLE_KEY` | your **service_role** key | server (cron) — keep secret |

(Optional) `CRON_SECRET` — set any random string to stop strangers from
triggering the sync endpoint. Vercel Cron sends it automatically.

### 2.3 Deploy
Click **Deploy**. In ~1 minute you get a URL like
`https://your-app.vercel.app`. Then go back and do **step 1.4** (redirect URL)
in Supabase.

### 2.4 Load the fixtures
Open your site, sign in, create a league, and open it. Hit **↻ Refresh scores**
once to pull the season's fixtures in immediately.

> **How live scoring stays current (important on the free plan):** Vercel's
> **Hobby plan only allows a cron job to run once per day** — a more frequent
> schedule fails the deployment. So `vercel.json` sets the cron to daily
> (`0 6 * * *`) as a safety-net refresh. The *live* updating during matches is
> done by the **app itself**: while you have a locked gameweek open, it quietly
> re-syncs results from the FPL API every 60 seconds, so the table moves in near
> real time. You can also press **↻ Refresh scores** any time.
>
> Want hands-off, always-on scoring even when nobody has the site open? Upgrade
> the project to **Vercel Pro** and change the cron in `vercel.json` to e.g.
> `*/5 * * * *` (every 5 minutes). Not required for a normal group game.

---

## Running a season

- **Predictions lock at each gameweek's deadline** (the FPL deadline, ~90 min
  before the first kickoff). Until then, everyone edits privately — nobody can
  see anyone else's picks.
- **After lock**, the gameweek view shows everyone's predictions side by side,
  with points filling in live as matches finish.
- **The Table** tab is the running season leaderboard, updated automatically.

---

## Troubleshooting

- **"Connect Supabase" screen** → the `VITE_` env vars aren't set (or the app
  wasn't redeployed after adding them). Check Vercel → Settings → Environment
  Variables, then redeploy.
- **Login link goes to the wrong place / "invalid" error** → set your Vercel URL
  in Supabase **Authentication → URL Configuration** (step 1.4).
- **No fixtures / scores** → click **↻ Refresh scores**. If it still fails, the
  FPL API may be mid-update (it goes offline briefly between seasons and during
  daily maintenance) — try again shortly. Also confirm `SUPABASE_SERVICE_ROLE_KEY`
  is set in Vercel.
- **Scores not moving during matches** → the free cron may be running
  infrequently; hit **↻ Refresh scores**, or upgrade the schedule/plan.
- **Someone can't see others' predictions before a match** → that's intended.
  They only appear once the gameweek deadline has passed.
