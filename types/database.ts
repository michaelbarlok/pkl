export type UserRole = "admin" | "player";
export type SignUpStatus = "confirmed" | "waitlist" | "withdrawn";
export type SessionStatus = "upcoming" | "active" | "completed" | "cancelled";
export type AnnouncementType =
  | "general"
  | "schedule_change"
  | "session_reminder"
  | "weather_cancellation";

export interface Player {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  phone?: string;
  skill_rating?: number;
  role: UserRole;
  push_token?: string;
  created_at: string;
  updated_at: string;
}

export interface Session {
  id: string;
  date: string;
  location: string;
  max_players: number;
  cutoff_time: string;
  status: SessionStatus;
  num_courts: number;
  start_time: string;
  notes?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface SignUp {
  id: string;
  session_id: string;
  player_id: string;
  signed_up_at: string;
  status: SignUpStatus;
  waitlist_position?: number;
  player?: Player;
}

export interface Court {
  id: string;
  session_id: string;
  court_number: number;
  label: string;
}

export interface Round {
  id: string;
  session_id: string;
  round_number: number;
  started_at?: string;
  completed_at?: string;
}

export interface Match {
  id: string;
  round_id: string;
  court_id: string;
  team1_player_ids: string[];
  team2_player_ids: string[];
  team1_score?: number;
  team2_score?: number;
  score_entered_by?: string;
  score_entered_at?: string;
  court?: Court;
  round?: Round;
  team1_players?: Player[];
  team2_players?: Player[];
}

export interface PlayerSessionState {
  id: string;
  session_id: string;
  player_id: string;
  current_court: number;
  wins: number;
  losses: number;
  peak_court?: number;
  player?: Player;
}

export interface Announcement {
  id: string;
  league_id: string;
  session_id?: string;
  type: AnnouncementType;
  title: string;
  body: string;
  sent_at: string;
  sent_by: string;
  sender?: Player;
}

export interface AllTimeStats {
  player_id: string;
  player?: Player;
  total_wins: number;
  total_losses: number;
  sessions_played: number;
  win_percentage: number;
  peak_court: number;
}
