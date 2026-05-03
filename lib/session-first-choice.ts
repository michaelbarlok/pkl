import { computeBalancedFirstChoices } from "./first-choice";

/**
 * Build a per-game first-choice map for an entire ladder session,
 * keyed by `${round}:${court}:${gameNumber}`. Walks rounds in order,
 * carries per-player counts across rounds, and uses the balanced
 * picker per court so first-choice rotates as evenly as the schedule
 * structure allows.
 *
 * Why session-wide instead of per-court:
 *   - 4-player rounds cap balance at 2-2-2-0 (one player must miss
 *     out per round) due to the round-robin pairing structure. Within
 *     a single round there's no avoiding it. Across rounds we can
 *     rotate which player gets the 0 — so over a multi-round session,
 *     no player goes the whole event without first-choice.
 *   - 5-player rounds balance to exactly 2 each in a single round
 *     (10 first-choice slots / 5 players); cross-round seeding still
 *     helps if a player slides between courts of different sizes.
 *
 * Past rounds' rosters are derived from `scores` (game_results rows
 * already have the four player ids per game). The current round's
 * roster comes from `participants.court_number`. The schedule for
 * each court is regenerated deterministically from the sorted
 * player_ids — same logic as `generateMatchSchedule` in the session
 * pages, kept in sync here.
 */

export interface SessionGameResult {
  round_number: number;
  pool_number: number;
  team_a_p1: string | null | undefined;
  team_a_p2: string | null | undefined;
  team_b_p1: string | null | undefined;
  team_b_p2: string | null | undefined;
}

export interface SessionParticipant {
  player_id: string;
  court_number: number | null;
}

interface ScheduleMatch {
  gameNumber: number;
  team1: string[];
  team2: string[];
}

function scheduleForCourt(sortedPlayerIds: string[]): ScheduleMatch[] {
  const n = sortedPlayerIds.length;
  if (n === 4) {
    const [a, b, c, d] = sortedPlayerIds;
    return [
      { gameNumber: 1, team1: [a, b], team2: [c, d] },
      { gameNumber: 2, team1: [a, c], team2: [b, d] },
      { gameNumber: 3, team1: [a, d], team2: [b, c] },
    ];
  }
  if (n === 5) {
    const [a, b, c, d, e] = sortedPlayerIds;
    return [
      { gameNumber: 1, team1: [a, b], team2: [c, d] },
      { gameNumber: 2, team1: [a, c], team2: [b, e] },
      { gameNumber: 3, team1: [b, d], team2: [a, e] },
      { gameNumber: 4, team1: [c, e], team2: [a, d] },
      { gameNumber: 5, team1: [d, e], team2: [b, c] },
    ];
  }
  return [];
}

export function buildSessionFirstChoiceMap(
  sessionId: string,
  currentRound: number,
  participants: SessionParticipant[],
  scores: SessionGameResult[],
): Map<string, "team1" | "team2"> {
  const result = new Map<string, "team1" | "team2">();
  let counts = new Map<string, number>();

  const allRounds = new Set<number>([currentRound]);
  for (const s of scores) allRounds.add(s.round_number);
  const sortedRounds = [...allRounds].sort((a, b) => a - b);

  for (const round of sortedRounds) {
    const courtsInRound = new Set<number>();
    if (round === currentRound) {
      for (const p of participants) {
        if (p.court_number != null) courtsInRound.add(p.court_number);
      }
    } else {
      for (const s of scores) {
        if (s.round_number === round) courtsInRound.add(s.pool_number);
      }
    }

    for (const court of [...courtsInRound].sort((a, b) => a - b)) {
      let playerIds: string[];
      if (round === currentRound) {
        playerIds = participants
          .filter((p) => p.court_number === court)
          .map((p) => p.player_id);
      } else {
        const set = new Set<string>();
        for (const s of scores) {
          if (s.round_number !== round || s.pool_number !== court) continue;
          for (const id of [s.team_a_p1, s.team_a_p2, s.team_b_p1, s.team_b_p2]) {
            if (id) set.add(id);
          }
        }
        playerIds = [...set];
      }

      const sorted = [...playerIds].sort();
      const matches = scheduleForCourt(sorted);
      if (matches.length === 0) continue;

      const { assignments, finalCounts } = computeBalancedFirstChoices(
        matches,
        (m) => `${sessionId}:${round}:${court}:${m.gameNumber}`,
        counts,
      );

      for (const [m, pick] of assignments) {
        result.set(`${round}:${court}:${m.gameNumber}`, pick);
      }
      counts = finalCounts;
    }
  }

  return result;
}

export function lookupSessionFirstChoice(
  map: Map<string, "team1" | "team2">,
  round: number,
  court: number,
  gameNumber: number,
): "team1" | "team2" | null {
  return map.get(`${round}:${court}:${gameNumber}`) ?? null;
}
