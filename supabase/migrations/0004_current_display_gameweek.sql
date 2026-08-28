-- Which gameweek should the app open on?
--
-- The `gameweeks` table is a straight mirror of the FPL API, including its
-- `is_current` flag — which FPL leaves pointing at a gameweek until it finishes
-- its post-round data check, up to a day or two after the last match. That made
-- the app keep opening on a gameweek whose matches were long over.
--
-- Rather than store a second "display week" (which something would then have to
-- keep updated, and the sync would overwrite), we derive it on demand from data
-- we already mirror — fixture kickoff times and their finished flags:
--
--   * A gameweek is CONCLUDED when every one of its fixtures is finished AND a
--     full day has passed since its last kickoff (a review-window grace period
--     so the just-played round stays on screen the day after).
--   * The display gameweek is the FIRST gameweek that is not yet concluded
--     (i.e. the one in play, or the next one to predict), or the last gameweek
--     once the whole season is done.
--
-- Pure function of now() + the mirror, so nothing to store and nothing for the
-- sync to clobber. Reads only world-readable reference data, so no elevated
-- privileges are needed.
--
-- Run this whole file once in the Supabase SQL editor.

create or replace function current_display_gameweek()
returns int
language sql stable set search_path = public as $$
  with gw as (
    select
      g.id,
      count(f.id)                          as fixtures,
      coalesce(bool_and(f.finished), false) as all_finished,
      max(f.kickoff_time)                  as last_kickoff
    from gameweeks g
    left join fixtures f on f.gameweek = g.id
    group by g.id
  ),
  state as (
    select
      id,
      -- Grace period: keep a finished round on screen until a full day after
      -- its last kickoff. Change the interval to tune the review window.
      (fixtures > 0
        and all_finished
        and last_kickoff is not null
        and now() >= last_kickoff + interval '1 day') as concluded
    from gw
  )
  select coalesce(
    (select id from state where not concluded order by id asc limit 1),
    (select max(id) from state)
  );
$$;

grant execute on function current_display_gameweek() to authenticated;
