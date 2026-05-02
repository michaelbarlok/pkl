import { validateScore } from "@/lib/score-validation";

describe("validateScore — non-win-by-2 (first to N)", () => {
  test("accepts the limit-vs-anything-below", () => {
    expect(validateScore({ scoreA: 15, scoreB: 0, gameLimit: 15, winBy2: false })).toEqual({ ok: true });
    expect(validateScore({ scoreA: 15, scoreB: 14, gameLimit: 15, winBy2: false })).toEqual({ ok: true });
    expect(validateScore({ scoreA: 7, scoreB: 15, gameLimit: 15, winBy2: false })).toEqual({ ok: true });
  });

  test("rejects winner past the limit (game would have already ended)", () => {
    const r = validateScore({ scoreA: 16, scoreB: 7, gameLimit: 15, winBy2: false });
    expect(r.ok).toBe(false);
  });

  test("rejects when neither team reaches the limit", () => {
    const r = validateScore({ scoreA: 14, scoreB: 12, gameLimit: 15, winBy2: false });
    expect(r.ok).toBe(false);
  });

  test("rejects ties", () => {
    expect(validateScore({ scoreA: 15, scoreB: 15, gameLimit: 15, winBy2: false }).ok).toBe(false);
    expect(validateScore({ scoreA: 0, scoreB: 0, gameLimit: 15, winBy2: false }).ok).toBe(false);
  });
});

describe("validateScore — win-by-2", () => {
  test("accepts limit-vs-≤(limit-2) (game ends at limit, 2-point lead already)", () => {
    expect(validateScore({ scoreA: 15, scoreB: 0, gameLimit: 15, winBy2: true })).toEqual({ ok: true });
    expect(validateScore({ scoreA: 15, scoreB: 13, gameLimit: 15, winBy2: true })).toEqual({ ok: true });
  });

  test("accepts overtime when loser ≥ limit-1 (winner = loser + 2)", () => {
    expect(validateScore({ scoreA: 16, scoreB: 14, gameLimit: 15, winBy2: true })).toEqual({ ok: true });
    expect(validateScore({ scoreA: 17, scoreB: 15, gameLimit: 15, winBy2: true })).toEqual({ ok: true });
    expect(validateScore({ scoreA: 22, scoreB: 20, gameLimit: 15, winBy2: true })).toEqual({ ok: true });
  });

  test("rejects 18-14 in 15-point win-by-2 (the user-reported bug)", () => {
    const r = validateScore({ scoreA: 18, scoreB: 14, gameLimit: 15, winBy2: true });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      // Message should clearly point to the would-have-ended score.
      expect(r.error).toMatch(/16-14/);
    }
  });

  test("rejects 15-14 (margin of 1)", () => {
    const r = validateScore({ scoreA: 15, scoreB: 14, gameLimit: 15, winBy2: true });
    expect(r.ok).toBe(false);
  });

  test("rejects 16-15 (margin of 1)", () => {
    const r = validateScore({ scoreA: 16, scoreB: 15, gameLimit: 15, winBy2: true });
    expect(r.ok).toBe(false);
  });

  test("rejects 16-13 (game would have ended at 15-13)", () => {
    const r = validateScore({ scoreA: 16, scoreB: 13, gameLimit: 15, winBy2: true });
    expect(r.ok).toBe(false);
  });

  test("rejects ties", () => {
    expect(validateScore({ scoreA: 15, scoreB: 15, gameLimit: 15, winBy2: true }).ok).toBe(false);
  });

  test("works for 11-point win-by-2 too", () => {
    expect(validateScore({ scoreA: 11, scoreB: 9, gameLimit: 11, winBy2: true })).toEqual({ ok: true });
    expect(validateScore({ scoreA: 12, scoreB: 10, gameLimit: 11, winBy2: true })).toEqual({ ok: true });
    expect(validateScore({ scoreA: 13, scoreB: 9, gameLimit: 11, winBy2: true }).ok).toBe(false);
  });
});

describe("validateScore — basic input checks", () => {
  test("rejects non-integers", () => {
    expect(validateScore({ scoreA: 15.5, scoreB: 13, gameLimit: 15, winBy2: false }).ok).toBe(false);
  });
  test("rejects negatives", () => {
    expect(validateScore({ scoreA: -1, scoreB: 0, gameLimit: 15, winBy2: false }).ok).toBe(false);
  });
});
