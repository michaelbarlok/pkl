// ============================================================
// Enums
// ============================================================

export type UserRole = "admin" | "player";

export type RegistrationStatus = "confirmed" | "waitlist" | "withdrawn";

export type SheetStatus = "open" | "closed" | "cancelled";

export type SessionStatus =
  | "created"
  | "checking_in"
  | "seeding"
  | "round_active"
  | "round_complete"
  | "session_complete";

export type AnnouncementType =
  | "general"
  | "schedule_change"
  | "session_reminder"
  | "weather_cancellation";

export type NotificationType =
  | "new_sheet"
  | "signup_reminder"
  | "sheet_updated"
  | "sheet_cancelled"
  | "waitlist_promoted"
  | "withdraw_closing"
  | "session_starting"
  | "pool_assigned"
  | "score_confirmed"
  | "step_changed"
  | "rating_updated"
  | "forum_reply"
  | "invite_sent";

// ============================================================
// Core Tables
// ============================================================

export interface Profile {
  id: string;
  user_id: string;
  full_name: string;
  display_name: string;
  email: string;
  phone?: string | null;
  avatar_url?: string | null;
  skill_level?: number | null;
  home_court?: string | null;
  bio?: string | null;
  is_active: boolean;
  member_since: string;
  preferred_notify: string[];
  role: UserRole;
  created_at: string;
  updated_at: string;
}

export interface SignupSheet {
  id: string;
  group_id: string;
  event_date: string;
  event_time: string;
  location: string;
  player_limit: number;
  signup_opens_at?: string | null;
  signup_closes_at: string;
  withdraw_closes_at?: string | null;
  allow_member_guests: boolean;
  notify_on_create: boolean;
  status: SheetStatus;
  notes?: string | null;
  signup_reminder_sent: boolean;
  withdraw_reminder_sent: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
  // Relations
  group?: ShootoutGroup;
}

export type RegistrationPriority = "high" | "normal" | "low";

export interface Registration {
  id: string;
  sheet_id: string;
  player_id: string;
  signed_up_at: string;
  status: RegistrationStatus;
  priority: RegistrationPriority;
  waitlist_position?: number | null;
  registered_by?: string | null;
  // Relations
  player?: Profile;
}

// ============================================================
// Shootout Groups
// ============================================================

export interface ShootoutGroup {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  created_by: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface GroupPreferences {
  group_id: string;
  pct_window_sessions: number;
  new_player_start_step: number;
  min_step: number;
  max_step: number;
  step_move_up: number;
  step_move_down: number;
  game_limit_4p: number;
  game_limit_5p: number;
  win_by_2: boolean;
  updated_at: string;
}

export interface GroupMembership {
  group_id: string;
  player_id: string;
  current_step: number;
  win_pct: number;
  total_sessions: number;
  last_played_at?: string | null;
  joined_at: string;
  // Relations
  player?: Profile;
  group?: ShootoutGroup;
}

// ============================================================
// Sessions & Participants
// ============================================================

export interface ShootoutSession {
  id: string;
  sheet_id: string;
  group_id: string;
  status: SessionStatus;
  num_courts: number;
  current_round: number;
  is_same_day_continuation: boolean;
  prev_session_id?: string | null;
  created_at: string;
  updated_at: string;
  // Relations
  sheet?: SignupSheet;
  group?: ShootoutGroup;
}

export interface SessionParticipant {
  id: string;
  session_id: string;
  group_id: string;
  player_id: string;
  checked_in: boolean;
  court_number?: number | null;
  pool_finish?: number | null;
  target_court_next?: number | null;
  step_before: number;
  step_after?: number | null;
  // Relations
  player?: Profile;
}

// ============================================================
// Game Results
// ============================================================

export interface GameResult {
  id: string;
  session_id: string;
  group_id: string;
  round_number: number;
  pool_number: number;
  team_a_p1: string;
  team_a_p2?: string | null;
  team_b_p1: string;
  team_b_p2?: string | null;
  score_a: number;
  score_b: number;
  entered_by: string;
  confirmed_by?: string | null;
  is_confirmed: boolean;
  is_disputed: boolean;
  created_at: string;
}

// ============================================================
// Player Ratings (ELO)
// ============================================================

export interface PlayerRating {
  player_id: string;
  elo_points: number;
  display_rating: number;
  games_played: number;
  rating_updated_at: string;
  // Relations
  player?: Profile;
}

// ============================================================
// Forum
// ============================================================

export interface ForumThread {
  id: string;
  author_id: string;
  title: string;
  body: string;
  pinned: boolean;
  deleted_at?: string | null;
  created_at: string;
  updated_at: string;
  // Relations
  author?: Profile;
  reply_count?: number;
}

export interface ForumReply {
  id: string;
  thread_id: string;
  author_id: string;
  body: string;
  created_at: string;
  // Relations
  author?: Profile;
}

// ============================================================
// Notifications
// ============================================================

export interface Notification {
  id: string;
  user_id: string;
  group_id?: string | null;
  type: NotificationType;
  title: string;
  body: string;
  link?: string | null;
  read_at?: string | null;
  created_at: string;
}

// ============================================================
// Announcements (legacy, kept for compatibility)
// ============================================================

export interface Announcement {
  id: string;
  league_id: string;
  session_id?: string | null;
  type: AnnouncementType;
  title: string;
  body: string;
  sent_at: string;
  sent_by: string;
  sender?: Profile;
}
