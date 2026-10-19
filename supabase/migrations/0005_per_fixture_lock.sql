-- Per-fixture locking — predict each game right up to its own kick-off.
--
-- Until now the whole gameweek locked at the FPL deadline (≈90 minutes before
-- the FIRST match of the round): after it, you could no longer edit ANY game in
-- the week, and everyone's predictions for the WHOLE week were revealed at once.
--
-- This moves both the write-lock and the reveal from the gameweek deadline to
-- each fixture's own kick-off:
--
--   * You can create or edit a prediction for a fixture until THAT fixture
--     kicks off (its kickoff_time passes, or FPL flags it `started`).
--   * Another member's prediction for a fixture becomes visible to you only once
--     THAT fixture has kicked off — not before. This is strictly fairer: a game
--     later in the week stays hidden while you're still predicting it, even
--     though an earlier game in the same week is already locked and on show.
--
-- Everything is still enforced server-side (SECURITY DEFINER RPC + RLS), so it
-- holds even if someone talks to the API directly. Scoring is unchanged.
--
-- Run this whole file once in the Supabase SQL editor.

-- ---------------------------------------------------------------------------
-- Helper: has a given fixture kicked off yet?
-- A fixture locks at its kickoff_time, or as soon as FPL marks it started
-- (belt and braces, in case kickoff_time drifts). A fixture with no kickoff
-- time set (TBC) is treated as not yet locked, so it stays predictable.
-- ---------------------------------------------------------------------------
create or replace function fixture_locked(_fixture_id int)
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select f.started or (f.kickoff_time is not null and f.kickoff_time <= now())
       from fixtures f where f.id = _fixture_id),
    false
  );
$$;

grant execute on function fixture_locked(int) to authenticated;

-- ---------------------------------------------------------------------------
-- Reveal rule: you always see your own predictions; you see someone else's for
-- a fixture only once that fixture has kicked off (replaces the gameweek-level
-- gw_locked() reveal). gw_locked() itself is left in place but is no longer
-- used here.
-- ---------------------------------------------------------------------------
drop policy if exists predictions_read on predictions;
create policy predictions_read on predictions for select to authenticated using (
  is_league_member(league_id, auth.uid())
  and (user_id = auth.uid() or fixture_locked(fixture_id))
);

-- ---------------------------------------------------------------------------
-- Save (insert or update) a prediction. The gameweek is still derived from the
-- fixture on the server (so the denormalised column and the UI's per-week
-- bucketing stay correct), but the lock is now the fixture's own kick-off
-- rather than the gameweek deadline — so a client cannot save or edit a game
-- once it has started, while other games in the same week remain open.
-- ---------------------------------------------------------------------------
create or replace function upsert_prediction(_league_id uuid, _fixture_id int, _home int, _away int)
returns void
language plpgsql security definer set search_path = public as $$
declare _gw int; _kickoff timestamptz; _started boolean;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not is_league_member(_league_id, auth.uid()) then
    raise exception 'You are not a member of this league';
  end if;
  if _home is null or _away is null or _home < 0 or _away < 0 or _home > 99 or _away > 99 then
    raise exception 'Scores must be between 0 and 99';
  end if;

  select f.gameweek, f.kickoff_time, f.started
    into _gw, _kickoff, _started
  from fixtures f
  where f.id = _fixture_id;

  if _gw is null then raise exception 'Unknown fixture'; end if;
  if _started or (_kickoff is not null and _kickoff <= now()) then
    raise exception 'This match has kicked off — predictions are locked';
  end if;

  insert into predictions(league_id, user_id, fixture_id, gameweek, pred_home, pred_away)
  values (_league_id, auth.uid(), _fixture_id, _gw, _home, _away)
  on conflict (league_id, user_id, fixture_id) do update
    set pred_home = excluded.pred_home,
        pred_away = excluded.pred_away,
        updated_at = now();
end;
$$;

grant execute on function upsert_prediction(uuid, int, int, int) to authenticated;
