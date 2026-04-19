import { formatDate } from "@/lib/utils";

/**
 * formatDate tests
 *
 * The key invariant is that a DATE column value (like "2026-04-19") renders
 * as the calendar day the admin chose — NOT one day earlier because JS parses
 * bare ISO dates as UTC midnight.
 */

describe("formatDate", () => {
  test("renders a DATE-only string in local time (no UTC rollback)", () => {
    const out = formatDate("2026-04-19");
    // Either day-of-week could show up depending on the test runner's TZ,
    // but the calendar day MUST be the one we asked for.
    expect(out).toMatch(/\b4-19-2026$/);
  });

  test("renders no-zone timestamp in local time", () => {
    const out = formatDate("2026-04-19T08:30:00");
    expect(out).toMatch(/\b4-19-2026$/);
  });

  test("handles a full ISO timestamp with an explicit zone", () => {
    // 2026-04-19T03:00:00Z = 2026-04-18 23:00 in America/New_York, so the
    // local calendar day is legitimately the 18th and formatDate should
    // reflect that — we're not forcing local parse for zoned strings.
    const out = formatDate("2026-04-19T03:00:00Z");
    expect(out).toMatch(/-\d{1,2}-2026$/);
  });

  test("includes weekday prefix", () => {
    expect(formatDate("2026-04-19")).toMatch(/^(Sun|Mon|Tue|Wed|Thu|Fri|Sat) /);
  });

  test("strips leading zeros on month and day", () => {
    const out = formatDate("2026-01-03");
    expect(out).toMatch(/ 1-3-2026$/);
  });
});
