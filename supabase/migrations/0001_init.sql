-- Football Score Predictions — database schema.
--
-- The game: friends join a "league", predict the scoreline of every Premier
-- League fixture each gameweek, and are scored automatically from live FPL
-- results:
--   * 3 points for the EXACT score  (e.g. predicted 3-1, actual 3-1)
--   * 1 point  for the correct RESULT (right winner, or a draw either way)
--   * 0 otherwise
--
-- Security model:
--   * Identity is a real Supabase Auth user (auth.uid()). Every row that
--     belongs to a person is keyed on their auth id.
--   * Reference data (gameweeks, fixtures) is world-readable to signed-in users
--     and writable ONLY by the service role (the cron sync job) — no client
--     write policy exists, so the anon/authenticated keys can never forge a
--     result.
--   * Predictions are private until their gameweek locks. Before the deadline
--     you can read only your OWN predictions; after the deadline everyone in the
--     league can see everyone's. This is enforced in RLS, so it holds even if
--     someone talks to the API directly.
--   * All writes that need validation (create/join league, save a prediction)
--     go through SECURITY DEFINER functions that re-check membership and the
--     lock server-side.
--
-- Run this whole file once in the Supabase SQL editor (or via the CLI).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- A public-facing display name per auth user.
create table if not exists profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  created_at   timestamptz not null default now()
);

create table if not exists leagues (
  id         uuid primary key default gen_random_uuid(),
  code       text unique not null,                 -- share code to join
  name       text not null,
  season     text not null default '2026/27',
  owner_id   uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists league_members (
  league_id uuid not null references leagues(id) on delete cascade,
  user_id   uuid not null references auth.users(id) on delete cascade,
  role      text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (league_id, user_id)
);

-- FPL gameweeks (events). Synced from the FPL API by the cron job.
create table if not exists gameweeks (
  id            int primary key,                   -- FPL event id (1..38)
  name          text not null,                     -- e.g. "Gameweek 1"
  deadline_time timestamptz not null,              -- predictions lock at this time
  is_current    boolean not null default false,
  is_next       boolean not null default false,
  finished      boolean not null default false
);

-- FPL fixtures. Synced from the FPL API by the cron job. Global (shared by all
-- leagues) — a fixture's result is the same for everyone.
create table if not exists fixtures (
  id           int primary key,                    -- FPL fixture id
  gameweek     int references gameweeks(id),
  kickoff_time timestamptz,
  home_team_id int not null,
  away_team_id int not null,
  home_team    text not null,                      -- full name, e.g. "Manchester United"
  away_team    text not null,
  home_short   text not null,                      -- e.g. "MUN"
  away_short   text not null,
  home_score   int,                                -- null until played
  away_score   int,
  started      boolean not null default false,
  finished     boolean not null default false,
  updated_at   timestamptz not null default now()
);

create index if not exists fixtures_gameweek_idx on fixtures (gameweek);

create table if not exists predictions (
  id         uuid primary key default gen_random_uuid(),
  league_id  uuid not null references leagues(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  fixture_id int  not null references fixtures(id) on delete cascade,
  gameweek   int  not null,                        -- denormalised (server-set) for fast filtering
  pred_home  int  not null check (pred_home >= 0 and pred_home <= 99),
  pred_away  int  not null check (pred_away >= 0 and pred_away <= 99),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (league_id, user_id, fixture_id)
);

create index if not exists predictions_league_gw_idx on predictions (league_id, gameweek);

-- ---------------------------------------------------------------------------
-- Helper functions (SECURITY DEFINER so RLS policies can call them without
-- recursing into the very tables they protect).
-- ---------------------------------------------------------------------------
create or replace function is_league_member(_league_id uuid, _user_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from league_members m
    where m.league_id = _league_id and m.user_id = _user_id
  );
$$;

-- True once a gameweek's deadline has passed (predictions locked).
create or replace function gw_locked(_gameweek int)
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select g.deadline_time <= now() from gameweeks g where g.id = _gameweek),
    false
  );
$$;

grant execute on function is_league_member(uuid, uuid) to authenticated;
grant execute on function gw_locked(int)               to authenticated;

-- ---------------------------------------------------------------------------
-- Scoring view — a prediction joined to its fixture, with points applied.
-- security_invoker=true makes the view respect the CALLER's RLS on the base
-- tables, so it can never leak predictions a user isn't allowed to see.
-- ---------------------------------------------------------------------------
create or replace view prediction_scores with (security_invoker = true) as
select
  p.id,
  p.league_id,
  p.user_id,
  p.fixture_id,
  p.gameweek,
  p.pred_home,
  p.pred_away,
  f.home_score,
  f.away_score,
  f.finished,
  case
    when f.finished and f.home_score is not null and f.away_score is not null then
      case
        when p.pred_home = f.home_score and p.pred_away = f.away_score then 3
        when sign(p.pred_home - p.pred_away) = sign(f.home_score - f.away_score) then 1
        else 0
      end
    else null                                      -- not scored yet
  end as points
from predictions p
join fixtures f on f.id = p.fixture_id;

-- Season standings per league member.
create or replace view league_standings with (security_invoker = true) as
select
  ps.league_id,
  ps.user_id,
  pr.display_name,
  count(*) filter (where ps.points is not null)                 as played,
  count(*) filter (where ps.points = 3)                         as exact_scores,
  count(*) filter (where ps.points = 1)                         as correct_results,
  coalesce(sum(ps.points), 0)                                   as total_points
from prediction_scores ps
join profiles pr on pr.id = ps.user_id
group by ps.league_id, ps.user_id, pr.display_name;

grant select on prediction_scores to authenticated;
grant select on league_standings  to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table profiles       enable row level security;
alter table leagues        enable row level security;
alter table league_members enable row level security;
alter table gameweeks      enable row level security;
alter table fixtures       enable row level security;
alter table predictions    enable row level security;

-- profiles: display names are not secret; anyone signed in can read them, and
-- you can create/update only your own.
drop policy if exists profiles_read   on profiles;
drop policy if exists profiles_insert on profiles;
drop policy if exists profiles_update on profiles;
create policy profiles_read   on profiles for select to authenticated using (true);
create policy profiles_insert on profiles for insert to authenticated with check (id = auth.uid());
create policy profiles_update on profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- reference data: read-only to signed-in users. No write policy => only the
-- service role (cron) can write.
drop policy if exists gameweeks_read on gameweeks;
drop policy if exists fixtures_read  on fixtures;
create policy gameweeks_read on gameweeks for select to authenticated using (true);
create policy fixtures_read  on fixtures  for select to authenticated using (true);

-- leagues: readable by members; created/updated/deleted by the owner. Joining
-- by code happens through join_league() (SECURITY DEFINER), so no public read
-- of arbitrary leagues is needed.
drop policy if exists leagues_read   on leagues;
drop policy if exists leagues_insert on leagues;
drop policy if exists leagues_update on leagues;
drop policy if exists leagues_delete on leagues;
create policy leagues_read   on leagues for select to authenticated using (is_league_member(id, auth.uid()));
create policy leagues_insert on leagues for insert to authenticated with check (owner_id = auth.uid());
create policy leagues_update on leagues for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy leagues_delete on leagues for delete to authenticated using (owner_id = auth.uid());

-- league_members: a member can see the co-members of their league. Inserts go
-- through create_league()/join_league().
drop policy if exists members_read on league_members;
create policy members_read on league_members for select to authenticated using (is_league_member(league_id, auth.uid()));

-- predictions: SELECT is the game-fairness rule. You can always see your own;
-- others' become visible only once their gameweek has locked. Writes go through
-- upsert_prediction(), which re-checks the lock, so no write policy is needed.
drop policy if exists predictions_read on predictions;
create policy predictions_read on predictions for select to authenticated using (
  is_league_member(league_id, auth.uid())
  and (user_id = auth.uid() or gw_locked(gameweek))
);

-- ---------------------------------------------------------------------------
-- RPCs (all validate the caller server-side)
-- ---------------------------------------------------------------------------

-- Create a league and enrol the caller as its owner.
create or replace function create_league(_name text)
returns table(league_id uuid, code text)
language plpgsql security definer set search_path = public as $$
declare _id uuid; _code text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if coalesce(btrim(_name), '') = '' then raise exception 'League name is required'; end if;

  loop
    _code := upper(substr(md5(gen_random_uuid()::text), 1, 6));
    exit when not exists (select 1 from leagues l where l.code = _code);
  end loop;

  insert into leagues(code, name, owner_id)
  values (_code, btrim(_name), auth.uid())
  returning leagues.id into _id;

  insert into league_members(league_id, user_id, role)
  values (_id, auth.uid(), 'owner');

  return query select _id, _code;
end;
$$;

-- Join a league by its share code.
create or replace function join_league(_code text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare _id uuid;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select id into _id from leagues where code = upper(btrim(_code));
  if _id is null then raise exception 'League not found'; end if;

  insert into league_members(league_id, user_id, role)
  values (_id, auth.uid(), 'member')
  on conflict (league_id, user_id) do nothing;

  return _id;
end;
$$;

-- Save (insert or update) a prediction. The gameweek is derived from the
-- fixture on the server, and the deadline is re-checked here — so a client
-- cannot save or edit after the lock, or mislabel a fixture's gameweek.
create or replace function upsert_prediction(_league_id uuid, _fixture_id int, _home int, _away int)
returns void
language plpgsql security definer set search_path = public as $$
declare _gw int; _deadline timestamptz;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not is_league_member(_league_id, auth.uid()) then
    raise exception 'You are not a member of this league';
  end if;
  if _home is null or _away is null or _home < 0 or _away < 0 or _home > 99 or _away > 99 then
    raise exception 'Scores must be between 0 and 99';
  end if;

  select f.gameweek, g.deadline_time
    into _gw, _deadline
  from fixtures f
  join gameweeks g on g.id = f.gameweek
  where f.id = _fixture_id;

  if _gw is null then raise exception 'Unknown fixture'; end if;
  if _deadline <= now() then raise exception 'Predictions for this gameweek are locked'; end if;

  insert into predictions(league_id, user_id, fixture_id, gameweek, pred_home, pred_away)
  values (_league_id, auth.uid(), _fixture_id, _gw, _home, _away)
  on conflict (league_id, user_id, fixture_id) do update
    set pred_home = excluded.pred_home,
        pred_away = excluded.pred_away,
        updated_at = now();
end;
$$;

grant execute on function create_league(text)                       to authenticated;
grant execute on function join_league(text)                         to authenticated;
grant execute on function upsert_prediction(uuid, int, int, int)    to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime: live score + prediction updates. RLS still applies to realtime, so
-- clients only receive rows they're allowed to see.
-- ---------------------------------------------------------------------------
alter table fixtures    replica identity full;
alter table predictions replica identity full;

alter publication supabase_realtime add table fixtures;
alter publication supabase_realtime add table predictions;
