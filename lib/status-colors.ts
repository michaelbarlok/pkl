/** Shared status badge colors for tournaments */
export const TOURNAMENT_STATUS_COLORS: Record<string, string> = {
  draft: "bg-surface-overlay text-dark-200",
  registration_open: "bg-teal-900/30 text-teal-300",
  registration_closed: "bg-brand-900/40 text-brand-300",
  in_progress: "bg-accent-900/40 text-accent-300",
  completed: "bg-surface-overlay text-dark-200",
  cancelled: "bg-red-900/30 text-red-400",
};

export const TOURNAMENT_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  registration_open: "Registration Open",
  registration_closed: "Registration Closed",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

/** Shared status badge colors for sessions */
export const SESSION_STATUS_LABELS: Record<string, string> = {
  created: "Created",
  checking_in: "Check-In Open",
  seeding: "Seeding Courts",
  round_active: "Round In Progress",
  round_complete: "Round Complete",
  session_complete: "Session Complete",
};

export const SESSION_STATUS_COLORS: Record<string, string> = {
  created: "bg-surface-overlay text-dark-200",
  checking_in: "bg-accent-900/40 text-accent-300",
  seeding: "bg-brand-900/40 text-brand-300",
  round_active: "bg-teal-900/30 text-teal-300",
  round_complete: "bg-brand-900/40 text-brand-300",
  session_complete: "bg-surface-overlay text-dark-200",
};
