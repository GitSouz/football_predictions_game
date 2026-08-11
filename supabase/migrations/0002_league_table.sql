-- League table, take 2.
--
-- The original `league_standings` view was built on top of `prediction_scores`,
-- which honours the "predictions are hidden until the gameweek locks" RLS rule.
-- Before any gameweek has locked, that means a member can only see their own
-- predictions — so the table showed just the logged-in user.
--
-- This replaces it with a SECURITY DEFINER function that lists EVERY member of
-- the league (so everyone appears from day one, on 0 points) and totals points
-- only from FINISHED fixtures. Finished games are always past their deadline, so
-- exposing the aggregate never reveals an unlocked prediction. The caller is
-- still verified to be a member, so it can't be used to read other leagues.
--
-- Run this whole file once in the Supabase SQL editor.

create or replace function league_table(_league_id uuid)
returns table(
  user_id         uuid,
  display_name    text,
  played          int,
  exact_scores    int,
  correct_results int,
  total_points    int
)
language sql stable security definer set search_path = public as $$
  select
    m.user_id,
    pr.display_name,
    coalesce(count(*) filter (where s.points is not null), 0)::int  as played,
    coalesce(count(*) filter (where s.points = 3), 0)::int          as exact_scores,
    coalesce(count(*) filter (where s.points = 1), 0)::int          as correct_results,
    coalesce(sum(s.points), 0)::int                                 as total_points
  from league_members m
  join profiles pr on pr.id = m.user_id
  left join (
    select
      p.user_id,
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
  ) s on s.user_id = m.user_id
  where m.league_id = _league_id
    and is_league_member(_league_id, auth.uid())   -- caller must be a member
  group by m.user_id, pr.display_name
  order by total_points desc, exact_scores desc, pr.display_name;
$$;

grant execute on function league_table(uuid) to authenticated;
