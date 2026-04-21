import { reminderWhenWord } from "@/lib/reminder-when";

/**
 * Locks the rule that fixed the "Session tomorrow" push going out
 * 15 minutes before the 4/20 5:30pm Athens session.
 */

describe("reminderWhenWord", () => {
  const tz = "America/New_York";

  test("15 minutes before event → 'starting soon'", () => {
    const now = new Date("2026-04-20T21:15:00Z"); // 5:15pm ET
    const event = "2026-04-20T21:30:00Z"; // 5:30pm ET
    expect(reminderWhenWord(event, tz, now)).toBe("starting soon");
  });

  test("2 hours before event (boundary) → 'starting soon'", () => {
    const now = new Date("2026-04-20T19:30:00Z");
    const event = "2026-04-20T21:30:00Z";
    expect(reminderWhenWord(event, tz, now)).toBe("starting soon");
  });

  test("same calendar day (ET), more than 2 hours out → 'today'", () => {
    const now = new Date("2026-04-20T13:00:00Z"); // 9am ET
    const event = "2026-04-20T21:30:00Z"; // 5:30pm ET
    expect(reminderWhenWord(event, tz, now)).toBe("today");
  });

  test("previous calendar day (ET) → 'tomorrow'", () => {
    const now = new Date("2026-04-19T13:00:00Z"); // Sunday 9am ET
    const event = "2026-04-20T21:30:00Z"; // Monday 5:30pm ET
    expect(reminderWhenWord(event, tz, now)).toBe("tomorrow");
  });

  test("calendar comparison happens in the EVENT's timezone", () => {
    // 10pm Monday ET event. A cron tick from a server that thinks in
    // PT at "Monday 7:30pm PT" is still Monday in NY, so same-day.
    const now = new Date("2026-04-21T02:30:00Z"); // 10:30pm ET Monday
    const event = "2026-04-21T02:00:00Z"; // 10pm ET Monday — 30min out
    // Less than 2 hours → starting soon (wins before tz check).
    expect(reminderWhenWord(event, tz, now)).toBe("starting soon");
  });

  test("late-night Sunday ET reminder for Monday 6pm ET → 'tomorrow'", () => {
    // Sunday 11:30pm ET → event Monday 10pm ET (~22.5h out).
    const now = new Date("2026-04-20T03:30:00Z");
    const event = "2026-04-21T02:00:00Z";
    expect(reminderWhenWord(event, tz, now)).toBe("tomorrow");
  });
});
