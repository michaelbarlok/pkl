/**
 * Helpers for <input type="datetime-local"> ↔ ISO timestamp
 * round-tripping.
 *
 * The datetime-local input has no timezone component — its value is
 * a wall-clock string the browser interprets as LOCAL time. If we
 * hand that straight to Postgres's timestamptz column, the string
 * gets parsed as UTC and we're silently off by the user's UTC
 * offset. These helpers normalize the handoff so the organizer's
 * "8am my time" actually ends up stored as that moment in UTC, and
 * reads back into the form as "8am" again.
 */

/**
 * datetime-local wall-clock → UTC ISO. Empty input stays null.
 */
export function localDateTimeToIso(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

/**
 * UTC ISO from the DB → datetime-local wall-clock string.
 * Minute precision, no seconds / no TZ suffix — what the <input>
 * expects. Returns "" for null/undefined.
 */
export function isoToLocalDateTimeInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
