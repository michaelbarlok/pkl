/**
 * Sign-up sheet lifecycle rules — one source of truth, used by every
 * surface (list page, detail page, dashboard, group page, signup / withdraw
 * APIs) so the server and UI can't drift apart.
 *
 * Two rules live here:
 *
 *  1. **Signup & withdraw close at event start.** Whatever `signup_closes_at`
 *     or `withdraw_closes_at` admins set, they're capped at `event_time`.
 *     No one should be able to join or leave a sheet after play has started.
 *
 *  2. **Sheets are hidden 3 hours after event start.** The event is over;
 *     players don't need to see it, and admins still get a short grace
 *     window to review the roster before it drops off the list / detail /
 *     dashboard surfaces. Admin access can bypass this by opting in —
 *     see `sheetIsVisibleToPlayer`. The `/admin/sheets` management
 *     page never applies this filter, so admins can still pull up
 *     old rosters there indefinitely.
 */

/** Window in milliseconds after event start during which a sheet remains
 *  visible to players. After this, the list / detail / dashboard drop it. */
export const SHEET_VISIBLE_WINDOW_MS = 3 * 60 * 60 * 1000;

type SheetLifecycleShape = {
  event_time?: string | null;
  event_date?: string | null;
  signup_closes_at?: string | null;
  withdraw_closes_at?: string | null;
};

/** Best-effort event-start Date for a sheet. Prefers the precise `event_time`
 *  timestamp; falls back to midnight of `event_date` when the former isn't
 *  set (older rows). Returns null if neither is available. */
export function sheetEventStart(sheet: SheetLifecycleShape): Date | null {
  if (sheet.event_time) return new Date(sheet.event_time);
  if (sheet.event_date) return new Date(`${sheet.event_date}T00:00`);
  return null;
}

/** Has signup closed for this sheet? True when either the admin's
 *  `signup_closes_at` has passed or the event itself has started —
 *  whichever comes first. */
export function sheetSignupClosed(
  sheet: SheetLifecycleShape,
  now: Date = new Date()
): boolean {
  if (sheet.signup_closes_at && new Date(sheet.signup_closes_at) <= now) return true;
  const start = sheetEventStart(sheet);
  if (start && start <= now) return true;
  return false;
}

/** Has the withdraw window closed for this sheet? Same shape as signup —
 *  capped at `event_time` regardless of what the admin set. */
export function sheetWithdrawClosed(
  sheet: SheetLifecycleShape,
  now: Date = new Date()
): boolean {
  if (sheet.withdraw_closes_at && new Date(sheet.withdraw_closes_at) <= now) return true;
  const start = sheetEventStart(sheet);
  if (start && start <= now) return true;
  return false;
}

/** True once we've passed the 3-hour visibility window after event start.
 *  Surfaces that render to regular players should treat this as "gone". */
export function sheetIsExpired(
  sheet: SheetLifecycleShape,
  now: Date = new Date()
): boolean {
  const start = sheetEventStart(sheet);
  if (!start) return false;
  return now.getTime() > start.getTime() + SHEET_VISIBLE_WINDOW_MS;
}

/** Whether a regular (non-admin) player should see this sheet at all. */
export function sheetIsVisibleToPlayer(
  sheet: SheetLifecycleShape,
  now: Date = new Date()
): boolean {
  return !sheetIsExpired(sheet, now);
}
