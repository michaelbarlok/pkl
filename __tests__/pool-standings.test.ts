import {
  computePoolStandings,
  type RankedMember,
} from "@/lib/pool-standings";

/**
 * pool-standings tests
 *
 * Locks in the 5-level tiebreaker + tiebreakerReason emission so
 * the live Play-tab / Admin-sessions display can't drift from the
 * server-side pool_finish recompute.
 */

function mkPlayer(id: string, name = id) {
  return { player_id: id, player: { display_name: name } };
}

function mkGame(aIds: string[], bIds: string[], scoreA: number, scoreB: number) {
  return {
    team_a_p1: aIds[0],
    team_a_p2: aIds[1] ?? null,
    team_b_p1: bIds[0],
    team_b_p2: bIds[1] ?? null,
    score_a: scoreA,
    score_b: scoreB,
  };
}

describe("computePoolStandings", () => {
  test("sorts by wins desc, then point diff desc", () => {
    const players = [mkPlayer("a"), mkPlayer("b"), mkPlayer("c"), mkPlayer("d")];
    const scores = [
      mkGame(["a", "b"], ["c", "d"], 11, 3), // a,b win by 8
      mkGame(["a", "c"], ["b", "d"], 11, 7), // a,c win by 4
      mkGame(["a", "d"], ["b", "c"], 11, 9), // a,d win by 2
    ];
    const s = computePoolStandings(players, scores);
    expect(s[0].playerId).toBe("a"); // 3-0
    // b and c both 1-2 but b is -2 (+8,-4,-2=+2... wait recompute)
    // a: 3W, +8+4+2 = +14
    // b: won g1 (+8), lost g2 (-4), lost g3 (-2) → 1-2 +2
    // c: lost g1 (-8), won g2 (+4), lost g3 (-2) → 1-2 -6
    // d: lost g1 (-8), lost g2 (-4), won g3 (+2) → 1-2 -10
    expect(s[0].pointDiff).toBe(14);
    expect(s[1].playerId).toBe("b");
    expect(s[2].playerId).toBe("c");
    expect(s[3].playerId).toBe("d");
    // No ties → no reasons.
    expect(s.every((r) => r.tiebreakerReason === null)).toBe(true);
  });

  test("tied on W + pd + H2H + step → reason null with no memberMap", () => {
    // Without a memberMap the final tiebreaker can't be applied;
    // the sort stays stable but tiebreakerReason stays null.
    const players = [mkPlayer("a"), mkPlayer("b"), mkPlayer("c"), mkPlayer("d")];
    const scores = [
      mkGame(["a", "c"], ["b", "d"], 11, 5),
      mkGame(["a", "d"], ["b", "c"], 5, 11),
      mkGame(["a", "b"], ["c", "d"], 11, 7),
    ];
    const s = computePoolStandings(players, scores);
    // a and b are tied at positions 2 and 3. No memberMap → reason null.
    expect(s[1].tiebreakerReason).toBeNull();
  });

  test("step tiebreaker wins when H2H is equal", () => {
    const players = [mkPlayer("a"), mkPlayer("b"), mkPlayer("c"), mkPlayer("d")];
    const scores = [
      mkGame(["a", "c"], ["b", "d"], 11, 5),
      mkGame(["a", "d"], ["b", "c"], 5, 11),
      mkGame(["a", "b"], ["c", "d"], 11, 7),
    ];
    const memberMap = new Map<string, RankedMember>([
      ["a", { step: 3, winPct: 60 }],
      ["b", { step: 5, winPct: 60 }],
      ["c", { step: 4, winPct: 55 }],
      ["d", { step: 6, winPct: 50 }],
    ]);
    const s = computePoolStandings(players, scores, memberMap);
    // c is #1 on pd (+8). a/b tied at 2-1 +4; a has lower step, wins.
    expect(s[0].playerId).toBe("c");
    expect(s[1].playerId).toBe("a");
    expect(s[2].playerId).toBe("b");
    expect(s[1].tiebreakerReason).toBe("Higher overall rank");
  });

  test("win_pct is the last-resort tiebreaker", () => {
    // a and b end the pool tied at 2-1 +4 with H2H equal and same
    // step; winPct is the only remaining differentiator.
    // c is clear #1 (2-1 +8), d is last (0-3 -16), no ties involve
    // them — the tie we care about is between a and b at positions 2/3.
    const players = [mkPlayer("a"), mkPlayer("b"), mkPlayer("c"), mkPlayer("d")];
    const scores = [
      mkGame(["a", "c"], ["b", "d"], 11, 5),
      mkGame(["a", "d"], ["b", "c"], 5, 11),
      mkGame(["a", "b"], ["c", "d"], 11, 7),
    ];
    const memberMap = new Map<string, RankedMember>([
      ["a", { step: 5, winPct: 75 }],
      ["b", { step: 5, winPct: 65 }],
      ["c", { step: 4, winPct: 70 }],
      ["d", { step: 6, winPct: 60 }],
    ]);
    const s = computePoolStandings(players, scores, memberMap);
    expect(s[0].playerId).toBe("c");
    expect(s[1].playerId).toBe("a");
    expect(s[2].playerId).toBe("b");
    expect(s[3].playerId).toBe("d");
    expect(s[1].tiebreakerReason).toBe("Higher Points %");
    expect(s[2].tiebreakerReason).toBeNull();
  });

  test("no tiebreaker reason when every metric is identical", () => {
    const players = [mkPlayer("a"), mkPlayer("b")];
    const scores: ReturnType<typeof mkGame>[] = [];
    const memberMap = new Map<string, RankedMember>([
      ["a", { step: 5, winPct: 50 }],
      ["b", { step: 5, winPct: 50 }],
    ]);
    const s = computePoolStandings(players, scores, memberMap);
    expect(s[0].tiebreakerReason).toBeNull();
    expect(s[1].tiebreakerReason).toBeNull();
  });
});
