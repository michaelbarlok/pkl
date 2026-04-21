import { displaySessionsForGroup } from "@/lib/utils";

/**
 * displaySessionsForGroup tests
 *
 * Locks in the display-cap behavior:
 *   - total clamped at windowSize
 *   - null/undefined total -> 0
 *   - null/undefined/zero window -> pass-through (no cap)
 */

describe("displaySessionsForGroup", () => {
  test("caps when total exceeds window", () => {
    expect(displaySessionsForGroup(16, 14)).toBe(14);
  });

  test("passes through when total <= window", () => {
    expect(displaySessionsForGroup(10, 14)).toBe(10);
    expect(displaySessionsForGroup(14, 14)).toBe(14);
  });

  test("treats null/undefined totals as 0", () => {
    expect(displaySessionsForGroup(null, 14)).toBe(0);
    expect(displaySessionsForGroup(undefined, 14)).toBe(0);
  });

  test("no cap when windowSize is null/undefined/0", () => {
    expect(displaySessionsForGroup(20, null)).toBe(20);
    expect(displaySessionsForGroup(20, undefined)).toBe(20);
    expect(displaySessionsForGroup(20, 0)).toBe(20);
  });

  test("handles the Athens example: 16 real+imported, window 14 → 14", () => {
    expect(displaySessionsForGroup(16, 14)).toBe(14);
  });
});
