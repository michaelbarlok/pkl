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

/**
 * Pre-built list of 15-minute time slots covering the typical
 * tournament play window. Returned as { value: "HH:MM" 24h, label:
 * "h:mm am/pm" 12h } so a <select> can store a clean DB value while
 * showing organizers a friendly label. Default range is 6:00 AM
 * through 10:00 PM, which covers every event we're likely to host.
 */
export function fifteenMinuteSlots(
  startHour = 6,
  endHour = 22
): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  for (let h = startHour; h <= endHour; h++) {
    for (let m = 0; m < 60; m += 15) {
      // Skip past endHour:15+ so the list stops at the top of the
      // closing hour (e.g. 10:00 PM, not 10:45 PM).
      if (h === endHour && m > 0) break;
      const hh = String(h).padStart(2, "0");
      const mm = String(m).padStart(2, "0");
      const value = `${hh}:${mm}`;
      const ampm = h >= 12 ? "pm" : "am";
      const h12 = h % 12 || 12;
      const label = `${h12}:${mm} ${ampm}`;
      out.push({ value, label });
    }
  }
  return out;
}

/**
 * Round a "YYYY-MM-DDTHH:MM" datetime-local string to the nearest
 * 15-minute slot. Used as an onBlur handler so a user who types or
 * pastes "8:07" gets snapped to "8:00", and "8:53" snaps to "9:00".
 * Empty / invalid input passes through unchanged.
 */
export function snapDateTimeLocalTo15(value: string): string {
  if (!value) return value;
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!match) return value;
  const [, datePart, hStr, mStr] = match;
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return value;
  // Round to nearest 15. 8 and 22 round down; 23 rounds up. 53 → 60
  // pushes the hour forward; 60 normalizes to next-hour :00.
  const totalMinutes = h * 60 + m;
  const snapped = Math.round(totalMinutes / 15) * 15;
  // Cap at end of day to avoid rolling into the next date silently.
  const capped = Math.min(snapped, 23 * 60 + 45);
  const hh = String(Math.floor(capped / 60)).padStart(2, "0");
  const mm = String(capped % 60).padStart(2, "0");
  return `${datePart}T${hh}:${mm}`;
}
