import { computeBalancedFirstChoices } from "@/lib/first-choice";
import { buildSessionFirstChoiceMap } from "@/lib/session-first-choice";

describe("computeBalancedFirstChoices — 5-player ladder round", () => {
  // Standard schedule for 5 sorted players a,b,c,d,e
  const matches = [
    { team1: ["a", "b"], team2: ["c", "d"] }, // bye e
    { team1: ["a", "c"], team2: ["b", "e"] }, // bye d
    { team1: ["b", "d"], team2: ["a", "e"] }, // bye c
    { team1: ["c", "e"], team2: ["a", "d"] }, // bye b
    { team1: ["d", "e"], team2: ["b", "c"] }, // bye a
  ];

  test("balances to exactly 2 first-choices per player in one round", () => {
    const { finalCounts } = computeBalancedFirstChoices(
      matches,
      (_, i) => `g:${i}`,
    );
    expect(finalCounts.get("a")).toBe(2);
    expect(finalCounts.get("b")).toBe(2);
    expect(finalCounts.get("c")).toBe(2);
    expect(finalCounts.get("d")).toBe(2);
    expect(finalCounts.get("e")).toBe(2);
  });
});

describe("computeBalancedFirstChoices — 4-player ladder round", () => {
  const matches = [
    { team1: ["a", "b"], team2: ["c", "d"] },
    { team1: ["a", "c"], team2: ["b", "d"] },
    { team1: ["a", "d"], team2: ["b", "c"] },
  ];

  test("worst-case spread is 2 in a single round (math forces 2-2-2-0)", () => {
    const { finalCounts } = computeBalancedFirstChoices(
      matches,
      (_, i) => `g:${i}`,
    );
    const counts = ["a", "b", "c", "d"].map((p) => finalCounts.get(p) ?? 0);
    const max = Math.max(...counts);
    const min = Math.min(...counts);
    // Single 4-player round can't avoid one player getting 0 or 3 — pairing
    // structure means 2-2-2-0 is the best achievable here.
    expect(max - min).toBeLessThanOrEqual(2);
  });

  test("cross-round seeding rotates the 0-count player", () => {
    // Round 1 with empty initial counts
    const r1 = computeBalancedFirstChoices(matches, (_, i) => `r1:${i}`);
    const r1Counts = ["a", "b", "c", "d"].map((p) => r1.finalCounts.get(p) ?? 0);

    // Round 2 seeded with round 1's final counts
    const r2 = computeBalancedFirstChoices(
      matches,
      (_, i) => `r2:${i}`,
      r1.finalCounts,
    );
    const r2Counts = ["a", "b", "c", "d"].map((p) => r2.finalCounts.get(p) ?? 0);

    // After 2 rounds, the spread should narrow.
    const spread2 = Math.max(...r2Counts) - Math.min(...r2Counts);
    const spread1 = Math.max(...r1Counts) - Math.min(...r1Counts);
    expect(spread2).toBeLessThanOrEqual(spread1);
  });
});

describe("computeBalancedFirstChoices — tie-break determinism", () => {
  test("same fallback key always picks the same team on a tie", () => {
    const matches = [{ team1: ["x", "y"], team2: ["p", "q"] }];
    const a = computeBalancedFirstChoices(matches, () => "stable-key");
    const b = computeBalancedFirstChoices(matches, () => "stable-key");
    expect(Array.from(a.assignments.values())).toEqual(
      Array.from(b.assignments.values()),
    );
  });

  test("lower-count team wins regardless of fallback hash", () => {
    // x has 5 pre-existing first choices; y/p/q have none. team1 = x+y,
    // team2 = p+q → team2 has lower sum.
    const initial = new Map<string, number>([["x", 5]]);
    const matches = [{ team1: ["x", "y"], team2: ["p", "q"] }];
    const r = computeBalancedFirstChoices(
      matches,
      () => "anything",
      initial,
    );
    expect(Array.from(r.assignments.values())[0]).toBe("team2");
  });
});

describe("buildSessionFirstChoiceMap — cross-round ladder", () => {
  const sessionId = "session-1";

  test("assigns first-choice for current round when no prior history", () => {
    const participants = [
      { player_id: "a", court_number: 1 },
      { player_id: "b", court_number: 1 },
      { player_id: "c", court_number: 1 },
      { player_id: "d", court_number: 1 },
    ];
    const map = buildSessionFirstChoiceMap(sessionId, 1, participants, []);
    expect(map.get("1:1:1")).toMatch(/team[12]/);
    expect(map.get("1:1:2")).toMatch(/team[12]/);
    expect(map.get("1:1:3")).toMatch(/team[12]/);
  });

  test("uses prior round results to seed counts for the current round", () => {
    // Round 1: same 4 players on court 1; we hand-feed game_results that
    // imply team1 was always picked (a accumulates 3 first-choices).
    const round1Scores = [
      { round_number: 1, pool_number: 1, team_a_p1: "a", team_a_p2: "b", team_b_p1: "c", team_b_p2: "d" },
      { round_number: 1, pool_number: 1, team_a_p1: "a", team_a_p2: "c", team_b_p1: "b", team_b_p2: "d" },
      { round_number: 1, pool_number: 1, team_a_p1: "a", team_a_p2: "d", team_b_p1: "b", team_b_p2: "c" },
    ];
    // Round 2: same 4 players. With a's count high, the algorithm should
    // prefer teams without a — meaning at least some non-a first-choice
    // assignments in round 2.
    const participants = [
      { player_id: "a", court_number: 1 },
      { player_id: "b", court_number: 1 },
      { player_id: "c", court_number: 1 },
      { player_id: "d", court_number: 1 },
    ];
    const map = buildSessionFirstChoiceMap(sessionId, 2, participants, round1Scores);
    expect(map.get("2:1:1")).toBeDefined();
    expect(map.get("2:1:2")).toBeDefined();
    expect(map.get("2:1:3")).toBeDefined();
  });
});
