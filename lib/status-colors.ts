/**
 * Status badge classes used across tournament, session, and sheet UI.
 * Maps domain-specific status -> one of five semantic pills defined in
 * globals.css (.status-live / -upcoming / -open / -closed / -cancelled),
 * so the same kind of state always reads the same color.
 */
export const TOURNAMENT_STATUS_COLORS: Record<string, string> = {
  draft: "status-closed",
  registration_open: "status-open",
  registration_closed: "status-upcoming",
  in_progress: "status-live",
  completed: "status-closed",
  cancelled: "status-cancelled",
};

export const TOURNAMENT_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  registration_open: "Registration Open",
  registration_closed: "Registration Closed",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const SESSION_STATUS_LABELS: Record<string, string> = {
  created: "Created",
  checking_in: "Check-In Open",
  seeding: "Seeding Courts",
  round_active: "Round In Progress",
  round_complete: "Round Complete",
  session_complete: "Session Complete",
};

export const SESSION_STATUS_COLORS: Record<string, string> = {
  created: "status-closed",
  checking_in: "status-upcoming",
  seeding: "status-upcoming",
  round_active: "status-live",
  round_complete: "status-upcoming",
  session_complete: "status-closed",
};
