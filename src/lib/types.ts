// Row shapes for the Supabase tables and views.

export interface Profile {
  id: string;
  display_name: string;
  created_at: string;
}

export interface League {
  id: string;
  code: string;
  name: string;
  season: string;
  owner_id: string;
  created_at: string;
}

export interface LeagueMember {
  league_id: string;
  user_id: string;
  role: 'owner' | 'member';
  joined_at: string;
}

export interface Gameweek {
  id: number;
  name: string;
  deadline_time: string; // ISO
  is_current: boolean;
  is_next: boolean;
  finished: boolean;
}

export interface Fixture {
  id: number;
  gameweek: number | null;
  kickoff_time: string | null;
  home_team_id: number;
  away_team_id: number;
  home_team: string;
  away_team: string;
  home_short: string;
  away_short: string;
  home_score: number | null;
  away_score: number | null;
  started: boolean;
  finished: boolean;
  updated_at: string;
}

export interface Prediction {
  id: string;
  league_id: string;
  user_id: string;
  fixture_id: number;
  gameweek: number;
  pred_home: number;
  pred_away: number;
  created_at: string;
  updated_at: string;
}

// Row from the `league_standings` view.
export interface Standing {
  league_id: string;
  user_id: string;
  display_name: string;
  played: number;
  exact_scores: number;
  correct_results: number;
  total_points: number;
}
