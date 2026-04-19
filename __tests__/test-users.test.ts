import { isTestUser } from "@/lib/test-users";

describe("isTestUser", () => {
  test("flags names starting with [TEST]", () => {
    expect(isTestUser("[TEST] Ace Brooks")).toBe(true);
    expect(isTestUser("[TEST] Cameron Rodriguez")).toBe(true);
  });

  test("is case-insensitive (tolerates [Test] or [test])", () => {
    expect(isTestUser("[Test] Whoever")).toBe(true);
    expect(isTestUser("[test] Whoever")).toBe(true);
  });

  test("tolerates leading whitespace (defensive)", () => {
    expect(isTestUser("   [TEST] Padded")).toBe(true);
  });

  test("does not flag real names", () => {
    expect(isTestUser("Michael Barlok")).toBe(false);
    expect(isTestUser("Alex")).toBe(false);
    expect(isTestUser("Testy McTesterson")).toBe(false); // word "Test" without the bracket
  });

  test("only matches the [TEST] prefix, not [TEST] mid-name", () => {
    expect(isTestUser("Alex [TEST]")).toBe(false);
  });

  test("handles null / empty safely", () => {
    expect(isTestUser(null)).toBe(false);
    expect(isTestUser(undefined)).toBe(false);
    expect(isTestUser("")).toBe(false);
  });
});
