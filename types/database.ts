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
  | "bumped_to_waitlist"
  | "withdraw_closing"
  | "session_starting"
  | "pool_assigned"
  | "score_confirmed"
  | "step_changed"
  | "rating_updated"
  | "forum_reply"
  | "forum_mention"
  | "invite_sent"
  | "tournament_registration"
  | "tournament_withdrawal"
  | "tournament_reminder"
  | "tournament_cancelled"
  | "badge_earned"
  | "session_recap"
  | "group_announcement";

export type CancellationReason = "lack_of_interest" | "inclement_weather" | "other";

export type TournamentFormat = "single_elimination" | "double_elimination" | "round_robin";
export type TournamentType = "singles" | "doubles";
export type TournamentGender = "mens" | "womens" | "mixed";
export type TournamentAge = "all_ages" | "senior";
export type TournamentSkill = "3.0" | "3.5" | "4.0" | "4.5+";
export type TournamentStatus = "draft" | "registration_open" | "registration_closed" | "in_progress" | "completed" | "cancelled";
export type TournamentRegistrationStatus = "confirmed" | "waitlist" | "withdrawn";
export type TournamentMatchStatus = "pending" | "in_progress" | "completed" | "bye";
export type TournamentBracket = "winners" | "losers" | "grand_final" | "playoff" | `pool_${number}`;

export type GroupType = "ladder_league" | "free_play";
export type GroupVisibility = "public" | "private";
export type LadderType = "court_promotion" | "dynamic_ranking";

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
  notification_preferences?: Record<string, "email" | "push" | "off"> | null;
  role: UserRole;
  dupr_id?: string | null;
  dupr_singles_rating?: number | null;
  dupr_doubles_rating?: number | null;
  usap_member_id?: string | null;
  usap_tier?: string | null;
  usap_expiration?: string | null;
  is_test: boolean;
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
  cancellation_reason?: CancellationReason | null;
  cancellation_message?: string | null;
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
  group_type: GroupType;
  ladder_type: LadderType;
  visibility: GroupVisibility;
  city?: string | null;
  state?: string | null;
  created_by: string;
  is_active: boolean;
  rolling_sessions_count: number;
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

export type GroupRole = "admin" | "member";

export type MemberSignupPriority = "high" | "normal" | "low";

export interface GroupMembership {
  group_id: string;
  player_id: string;
  current_step: number;
  win_pct: number;
  total_sessions: number;
  last_played_at?: string | null;
  joined_at: string;
  group_role: GroupRole;
  signup_priority: MemberSignupPriority;
  // Relations
  player?: Profile;
  group?: ShootoutGroup;
}

export interface GroupRecurringSchedule {
  id: string;
  group_id: string;
  day_of_week: number; // 0=Sun 6=Sat — when the event happens
  event_time: string; // "HH:MM:SS" in the group's timezone
  timezone: string; // IANA timezone, e.g. "America/New_York"
  location: string;
  player_limit: number;
  signup_opens_days_before: number | null; // legacy — superseded by post_day_of_week
  signup_closes_hours_before: number;
  withdraw_closes_hours_before: number | null;
  allow_member_guests: boolean;
  notes: string | null;
  is_active: boolean;
  post_day_of_week: number | null; // 0=Sun 6=Sat — when to post the sheet
  post_time: string | null; // "HH:MM:SS" in the group's timezone
  created_by: string | null;
  created_at: string;
  updated_at: string;
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
  group_id: string;
  title: string;
  body: string;
  pinned: boolean;
  deleted_at?: string | null;
  created_at: string;
  updated_at: string;
  // Relations
  author?: Profile;
  group?: ShootoutGroup;
  reply_count?: number;
  poll?: ForumPoll;
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

export interface ForumPoll {
  id: string;
  thread_id: string;
  question: string;
  anonymous: boolean;
  created_at: string;
  // Relations
  options?: ForumPollOption[];
}

export interface ForumPollOption {
  id: string;
  poll_id: string;
  label: string;
  sort_order: number;
  created_at: string;
  // Relations
  votes?: ForumPollVote[];
  vote_count?: number;
}

export interface ForumPollVote {
  id: string;
  poll_id: string;
  option_id: string;
  voter_id: string;
  created_at: string;
  // Relations
  voter?: Profile;
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
// Tournaments
// ============================================================

export type PaymentMethod = "venmo" | "paypal" | "zelle" | "cash" | "check" | "other";

export interface PaymentOption {
  method: PaymentMethod;
  detail: string;
}

export interface Tournament {
  id: string;
  title: string;
  description?: string | null;
  format: TournamentFormat;
  type: TournamentType;
  divisions: string[];
  start_date: string;
  end_date: string;
  start_time?: string | null;
  location: string;
  player_cap?: number | null;
  max_teams_per_division?: number | null;
  entry_fee?: string | null;
  payment_options?: PaymentOption[] | null;
  payment_link?: string | null;
  payment_directions?: string | null;
  registration_opens_at?: string | null;
  registration_closes_at?: string | null;
  status: TournamentStatus;
  score_to_win_pool?: number | null;
  score_to_win_playoff?: number | null;
  finals_best_of_3?: boolean | null;
  division_settings?: Record<string, { games_per_team?: number }> | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  // Relations
  creator?: Profile;
  registrations?: TournamentRegistration[];
  organizers?: TournamentOrganizer[];
}

export interface TournamentOrganizer {
  tournament_id: string;
  profile_id: string;
  added_at: string;
  // Relations
  profile?: Profile;
}

export interface TournamentRegistration {
  id: string;
  tournament_id: string;
  player_id: string;
  partner_id?: string | null;
  status: TournamentRegistrationStatus;
  waitlist_position?: number | null;
  division?: string | null;
  seed?: number | null;
  paid: boolean;
  registered_at: string;
  // Relations
  player?: Profile;
  partner?: Profile;
  tournament?: Tournament;
}

export interface TournamentMatch {
  id: string;
  tournament_id: string;
  round: number;
  match_number: number;
  bracket: TournamentBracket;
  division?: string | null;
  court?: string | null;
  player1_id?: string | null;
  player2_id?: string | null;
  score1: number[];
  score2: number[];
  winner_id?: string | null;
  status: TournamentMatchStatus;
  scheduled_time?: string | null;
  created_at: string;
  updated_at: string;
  // Relations
  player1?: Profile;
  player2?: Profile;
  winner?: Profile;
  tournament?: Tournament;
}

// ============================================================
// Free Play
// ============================================================

export interface FreePlayMatch {
  id: string;
  group_id: string;
  created_by: string;
  played_at: string;
  team_a_p1: string;
  team_a_p2?: string | null;
  team_b_p1: string;
  team_b_p2?: string | null;
  score_a: number;
  score_b: number;
  notes?: string | null;
  created_at: string;
  // Relations
  team_a_p1_profile?: Profile;
  team_a_p2_profile?: Profile;
  team_b_p1_profile?: Profile;
  team_b_p2_profile?: Profile;
}

export interface FreePlayPlayerStats {
  group_id: string;
  player_id: string;
  points_won: number;
  points_possible: number;
  games_played: number;
  wins: number;
  losses: number;
  point_diff: number;
  pct: number;
}

// ============================================================
// Badges
// ============================================================

export type BadgeCategory = "play" | "winning" | "rating" | "community" | "tournament" | "ladder";

export interface BadgeDefinition {
  code: string;
  name: string;
  description: string;
  category: BadgeCategory;
  sort_order: number;
  created_at: string;
}

export interface PlayerBadge {
  id: string;
  player_id: string;
  badge_code: string;
  earned_at: string;
  created_at: string;
  // Relations
  badge?: BadgeDefinition;
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
