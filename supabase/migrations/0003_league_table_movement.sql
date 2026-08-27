-- League table with movement — take 3.
--
-- `league_table` (0002) returns cumulative season totals, which is all the
-- standings need to render. To show a "moved up/down since last gameweek"
-- arrow we also need each member's total as it stood BEFORE the most recent
-- played gameweek, so the client can rank both and diff the positions.
--
-- This function returns both in one round-trip:
--   * total_points / exact_scores / correct_results / played — current, exactly
--     as league_table computes them (finished fixtures only).
--   * prev_*  — the same, but counting only gameweeks strictly before the latest
--     one that has any finished fixture. Before a second gameweek has been
--     played these are all zero (prev_played = 0 everywhere), which the client
--     reads as "no prior table yet" and shows no arrows.
--
-- Same security model as league_table: SECURITY DEFINER, but the caller is
-- verified to be a member, and only finished fixtures are ever aggregated, so
-- no still-hidden prediction is exposed.
--
-- Run this whole file once in the Supabase SQL editor.

create or replace function league_table_movement(_league_id uuid)
returns table(
  user_id         uuid,
  display_name    text,
  played          int,
  exact_scores    int,
  correct_results int,
  total_points    int,
  prev_played     int,
  prev_exact      int,
  prev_points     int
)
language sql stable security definer set search_path = public as $$
  with scored as (
    select
      p.user_id,
      f.gameweek,
      case
        when p.pred_home = f.home_score and p.pred_away = f.away_score then 3
        when sign(p.pred_home - p.pred_away) = sign(f.home_score - f.away_score) then 1
        else 0
      end as points
    from predictions p
    join fixtures f on f.id = p.fixture_id
    where p.league_id = _league_id
      and f.finished
      and f.home_score is not null
      and f.away_score is not null
  ),
  latest as (
    select coalesce(max(gameweek), 0) as gw from scored
  )
  select
    m.user_id,
    pr.display_name,
    coalesce(count(s.points), 0)::int                                   as played,
    coalesce(count(*) filter (where s.points = 3), 0)::int              as exact_scores,
    coalesce(count(*) filter (where s.points = 1), 0)::int              as correct_results,
    coalesce(sum(s.points), 0)::int                                     as total_points,
    coalesce(count(s.points) filter (where s.gameweek < l.gw), 0)::int  as prev_played,
    coalesce(count(*) filter (where s.points = 3 and s.gameweek < l.gw), 0)::int as prev_exact,
    coalesce(sum(s.points) filter (where s.gameweek < l.gw), 0)::int    as prev_points
  from league_members m
  join profiles pr on pr.id = m.user_id
  cross join latest l
  left join scored s on s.user_id = m.user_id
  where m.league_id = _league_id
    and is_league_member(_league_id, auth.uid())
  group by m.user_id, pr.display_name, l.gw
  order by total_points desc, exact_scores desc, pr.display_name;
$$;

grant execute on function league_table_movement(uuid) to authenticated;
