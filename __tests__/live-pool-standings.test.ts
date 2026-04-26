import { computePoolStandings } from "@/lib/tournament-bracket";

// Live data captured from the Test tournament's womens_all_ages_3.0
// pool after scoring all six round-robin matches via the real
// PUT /api/tournaments/[id]/bracket endpoint. This test pins the
// scoring algorithm against a hand-verified reference so future
// changes to computePoolStandings don't silently re-rank teams.

const TEAM_C = "c4e0a346-b46b-441a-a352-da79d85aeee8";
const TEAM_B = "bdc928ca-a005-42a9-8667-04261a199ab1";
const TEAM_E = "4e4b8e36-b6a2-43b5-8637-bd3c5d4c9e76";
const TEAM_F = "02bb8435-f287-49fd-aa88-f40904361eca";

const matches = [
  { player1_id: TEAM_C, player2_id: TEAM_B, score1: [11], score2: [7],  winner_id: TEAM_C, status: "completed" },
  { player1_id: TEAM_E, player2_id: TEAM_F, score1: [1],  score2: [11], winner_id: TEAM_F, status: "completed" },
  { player1_id: TEAM_C, player2_id: TEAM_E, score1: [11], score2: [6],  winner_id: TEAM_C, status: "completed" },
  { player1_id: TEAM_F, player2_id: TEAM_B, score1: [9],  score2: [11], winner_id: TEAM_B, status: "completed" },
  { player1_id: TEAM_C, player2_id: TEAM_F, score1: [11], score2: [9],  winner_id: TEAM_C, status: "completed" },
  { player1_id: TEAM_B, player2_id: TEAM_E, score1: [9],  score2: [11], winner_id: TEAM_E, status: "completed" },
];

describe("Pool play standings (live data)", () => {
  test("womens_all_ages_3.0 standings match hand-computed reference", () => {
    const standings = computePoolStandings(matches);
    expect(standings).toEqual([
      { id: TEAM_C, wins: 3, losses: 0, pointDiff: 11, tiebreakerReason: null },
      { id: TEAM_F, wins: 1, losses: 2, pointDiff: 6,  tiebreakerReason: null },
      { id: TEAM_B, wins: 1, losses: 2, pointDiff: -4, tiebreakerReason: null },
      { id: TEAM_E, wins: 1, losses: 2, pointDiff: -13, tiebreakerReason: null },
    ]);
  });

  test("totals reconcile: every game's PD sums to zero across teams", () => {
    const standings = computePoolStandings(matches);
    const totalPD = standings.reduce((s, r) => s + r.pointDiff, 0);
    expect(totalPD).toBe(0);
  });

  test("each team played 3 games (full 4-team round robin)", () => {
    const standings = computePoolStandings(matches);
    standings.forEach(r => expect(r.wins + r.losses).toBe(3));
  });
});
