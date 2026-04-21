/**
 * Pick a human "when" word for a session-reminder notification based
 * on how soon the event actually starts — in the event's own
 * timezone.
 *
 * Context: the start-reminders cron looks up to 25 hours ahead so
 * hourly ticks never miss a sheet. A sheet posted the morning of its
 * own 6pm event is therefore picked up same-day. Hard-coding
 * "tomorrow" in the push title was wrong for that case (it went out
 * 15 minutes before the Athens 4/20 5:30pm session and said "Session
 * tomorrow...").
 *
 * Rules:
 *   - event starts within the next 2 hours  → "starting soon"
 *   - event is on today's calendar day (tz) → "today"
 *   - otherwise (typical 24h-ahead reminder) → "tomorrow"
 */
export function reminderWhenWord(
  eventIso: string,
  tz: string,
  now: Date = new Date()
): "starting soon" | "today" | "tomorrow" {
  const event = new Date(eventIso);
  const hoursUntil = (event.getTime() - now.getTime()) / 3_600_000;
  if (hoursUntil <= 2) return "starting soon";
  const fmt = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(d);
  if (fmt(event) === fmt(now)) return "today";
  return "tomorrow";
}
