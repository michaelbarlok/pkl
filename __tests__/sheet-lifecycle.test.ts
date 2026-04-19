/**
 * Sign-up sheet lifecycle tests
 *
 * These rules live in one file (lib/sheet-lifecycle.ts) and are consumed
 * by the sheets list, sheet detail, dashboard, group page, and the
 * signup / withdraw API routes. If they drift the UI and server can
 * disagree about whether a sheet is still accepting signups.
 */

import {
  sheetSignupClosed,
  sheetWithdrawClosed,
  sheetIsExpired,
  sheetIsVisibleToPlayer,
  SHEET_VISIBLE_WINDOW_MS,
} from "@/lib/sheet-lifecycle";

// Use a fixed "now" so tests don't drift with wall-clock time.
const NOW = new Date("2026-04-20T18:00:00Z");
const iso = (d: Date) => d.toISOString();

function futureHours(h: number): string {
  return iso(new Date(NOW.getTime() + h * 3600_000));
}
function pastHours(h: number): string {
  return iso(new Date(NOW.getTime() - h * 3600_000));
}

describe("sheetSignupClosed", () => {
  test("open when both signup_closes_at and event_time are in the future", () => {
    const sheet = {
      signup_closes_at: futureHours(2),
      event_time: futureHours(5),
    };
    expect(sheetSignupClosed(sheet, NOW)).toBe(false);
  });

  test("closed when signup_closes_at has passed, even if event hasn't started", () => {
    const sheet = {
      signup_closes_at: pastHours(1),
      event_time: futureHours(3),
    };
    expect(sheetSignupClosed(sheet, NOW)).toBe(true);
  });

  test("closed when event has started, even if signup_closes_at is still in the future", () => {
    // The new rule: event start caps the signup window.
    const sheet = {
      signup_closes_at: futureHours(2),
      event_time: pastHours(0.1),
    };
    expect(sheetSignupClosed(sheet, NOW)).toBe(true);
  });

  test("closed at the exact moment the event starts", () => {
    const sheet = {
      signup_closes_at: futureHours(2),
      event_time: iso(NOW),
    };
    expect(sheetSignupClosed(sheet, NOW)).toBe(true);
  });
});

describe("sheetWithdrawClosed", () => {
  test("open when withdraw_closes_at is unset and event is in the future", () => {
    const sheet = { withdraw_closes_at: null, event_time: futureHours(5) };
    expect(sheetWithdrawClosed(sheet, NOW)).toBe(false);
  });

  test("closed when withdraw_closes_at has passed", () => {
    const sheet = {
      withdraw_closes_at: pastHours(0.5),
      event_time: futureHours(3),
    };
    expect(sheetWithdrawClosed(sheet, NOW)).toBe(true);
  });

  test("closed when event has started, regardless of withdraw_closes_at", () => {
    const sheet = {
      withdraw_closes_at: futureHours(2),
      event_time: pastHours(0.1),
    };
    expect(sheetWithdrawClosed(sheet, NOW)).toBe(true);
  });
});

describe("sheetIsExpired", () => {
  test("not expired just before the 12-hour window ends", () => {
    const sheet = {
      event_time: iso(new Date(NOW.getTime() - (SHEET_VISIBLE_WINDOW_MS - 1000))),
    };
    expect(sheetIsExpired(sheet, NOW)).toBe(false);
  });

  test("expired just after the 12-hour window ends", () => {
    const sheet = {
      event_time: iso(new Date(NOW.getTime() - (SHEET_VISIBLE_WINDOW_MS + 1000))),
    };
    expect(sheetIsExpired(sheet, NOW)).toBe(true);
  });

  test("not expired when event hasn't started yet", () => {
    const sheet = { event_time: futureHours(2) };
    expect(sheetIsExpired(sheet, NOW)).toBe(false);
  });

  test("falls back to event_date when event_time is missing (date-only sheets)", () => {
    // An event_date-only sheet yesterday is definitely > 12h old, so it's gone.
    const sheet = { event_time: null, event_date: "2026-04-18" };
    expect(sheetIsExpired(sheet, NOW)).toBe(true);
  });
});

describe("sheetIsVisibleToPlayer", () => {
  test("mirrors !sheetIsExpired", () => {
    const future = { event_time: futureHours(3) };
    const past = { event_time: pastHours(24) };
    expect(sheetIsVisibleToPlayer(future, NOW)).toBe(true);
    expect(sheetIsVisibleToPlayer(past, NOW)).toBe(false);
  });
});
