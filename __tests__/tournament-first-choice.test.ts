import { buildTournamentFirstChoiceMap } from "@/lib/tournament-first-choice";

function pool(matchId: string, p1: string, p2: string, round: number, num: number, division = "div1") {
  return {
    id: matchId,
    bracket: "pool_1",
    division,
    round,
    match_number: num,
    player1_id: p1,
    player2_id: p2,
  };
}
function playoff(matchId: string, p1: string, p2: string, division = "div1") {
  return {
    id: matchId,
    bracket: "playoff",
    division,
    round: 1,
    match_number: 1,
    player1_id: p1,
    player2_id: p2,
  };
}

describe("buildTournamentFirstChoiceMap — pool play balance", () => {
  test("4-team pool round-robin balances first-choice across teams", () => {
    // 4 teams (anchors a/b/c/d) — full round robin = 6 games.
    // Standard schedule:
    //   r1: ab vs cd, ac vs bd, ad vs bc  ... etc. We'll just feed
    //   matches in the order the bracket generator produced them.
    const matches = [
      pool("m1", "a", "b", 1, 1),
      pool("m2", "c", "d", 1, 2),
      pool("m3", "a", "c", 2, 1),
      pool("m4", "b", "d", 2, 2),
      pool("m5", "a", "d", 3, 1),
      pool("m6", "b", "c", 3, 2),
    ];
    const map = buildTournamentFirstChoiceMap(matches, [], "round_robin");

    // Tally per-anchor first-choice wins.
    const counts: Record<string, number> = { a: 0, b: 0, c: 0, d: 0 };
    for (const m of matches) {
      const pick = map.get(m.id);
      if (pick === "team1") counts[m.player1_id]++;
      if (pick === "team2") counts[m.player2_id]++;
    }
    const arr = Object.values(counts).sort();
    // 6 first-choice slots / 4 teams = 1.5 average. Best-case spread
    // is 1 (1-1-2-2). Greedy walk should hit it.
    expect(Math.max(...arr) - Math.min(...arr)).toBeLessThanOrEqual(1);
  });

  test("matches in different pools are balanced independently", () => {
    const matches = [
      // Pool 1 (division div1, bracket pool_1)
      { id: "p1m1", bracket: "pool_1", division: "div1", round: 1, match_number: 1, player1_id: "a", player2_id: "b" },
      // Pool 2 (different bracket)
      { id: "p2m1", bracket: "pool_2", division: "div1", round: 1, match_number: 1, player1_id: "c", player2_id: "d" },
    ];
    const map = buildTournamentFirstChoiceMap(matches, [], "round_robin");
    expect(map.get("p1m1")).toMatch(/team[12]/);
    expect(map.get("p2m1")).toMatch(/team[12]/);
  });
});

describe("buildTournamentFirstChoiceMap — playoff seed-based", () => {
  test("higher seed (lower number) gets first choice", () => {
    const matches = [playoff("p1", "anchorA", "anchorB")];
    const regs = [
      { player_id: "anchorA", division: "div1", seed: 1 },
      { player_id: "anchorB", division: "div1", seed: 4 },
    ];
    const map = buildTournamentFirstChoiceMap(matches, regs, "round_robin");
    expect(map.get("p1")).toBe("team1");
  });

  test("seed 8 vs seed 2: lower seed (2) wins", () => {
    const matches = [playoff("p2", "x", "y")];
    const regs = [
      { player_id: "x", division: "div1", seed: 8 },
      { player_id: "y", division: "div1", seed: 2 },
    ];
    const map = buildTournamentFirstChoiceMap(matches, regs, "round_robin");
    expect(map.get("p2")).toBe("team2");
  });

  test("missing seeds fall back to deterministic hash", () => {
    const matches = [playoff("p3", "u", "v")];
    const map = buildTournamentFirstChoiceMap(matches, [], "round_robin");
    // Either team is acceptable, just must be set and stable.
    expect(map.get("p3")).toMatch(/team[12]/);
    const map2 = buildTournamentFirstChoiceMap(matches, [], "round_robin");
    expect(map2.get("p3")).toBe(map.get("p3"));
  });
});

describe("buildTournamentFirstChoiceMap — single elimination treats all as bracket", () => {
  test("single_elim winners-bracket match goes to lower seed regardless of bracket name", () => {
    const matches = [
      {
        id: "se1",
        bracket: "winners",
        division: "div1",
        round: 1,
        match_number: 1,
        player1_id: "h",
        player2_id: "l",
      },
    ];
    const regs = [
      { player_id: "h", division: "div1", seed: 1 },
      { player_id: "l", division: "div1", seed: 16 },
    ];
    const map = buildTournamentFirstChoiceMap(matches, regs, "single_elimination");
    expect(map.get("se1")).toBe("team1");
  });
});

describe("buildTournamentFirstChoiceMap — round_robin pool 'winners' is pool play", () => {
  test("a 'winners' pool bracket in a round-robin format is treated as pool play", () => {
    const matches = [
      { id: "rr1", bracket: "winners", division: "div1", round: 1, match_number: 1, player1_id: "a", player2_id: "b" },
      { id: "rr2", bracket: "winners", division: "div1", round: 1, match_number: 2, player1_id: "c", player2_id: "d" },
    ];
    const map = buildTournamentFirstChoiceMap(matches, [], "round_robin");
    expect(map.get("rr1")).toMatch(/team[12]/);
    expect(map.get("rr2")).toMatch(/team[12]/);
  });
});
