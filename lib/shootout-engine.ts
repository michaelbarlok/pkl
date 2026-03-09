/**
 * Shootout Ladder Engine
 * Pure functions for the core ladder algorithm — fully unit testable.
 */

export interface PlayerPosition {
  playerId: string;
  courtNumber: number;
}

export interface MatchResult {
  team1PlayerIds: string[];
  team2PlayerIds: string[];
  team1Won: boolean;
}

export interface CourtAssignment {
  courtNumber: number;
  team1: string[];
  team2: string[];
}

/**
 * Seed players onto courts by skill rating (descending).
 * Top-rated players go to Court 1, next group to Court 2, etc.
 * Players with no rating are seeded to the bottom courts.
 */
export function seedPlayersToCourts(
  players: { id: string; skill_rating?: number | null }[],
  numCourts: number
): PlayerPosition[] {
  const playersPerCourt = Math.floor(players.length / numCourts);
  const remainder = players.length % numCourts;

  // Sort by skill rating descending; null ratings go last
  const sorted = [...players].sort((a, b) => {
    if (a.skill_rating == null && b.skill_rating == null) return 0;
    if (a.skill_rating == null) return 1;
    if (b.skill_rating == null) return -1;
    return b.skill_rating - a.skill_rating;
  });

  const positions: PlayerPosition[] = [];
  let playerIndex = 0;

  for (let court = 1; court <= numCourts; court++) {
    // Distribute remainder players to the top courts
    const courtSize = playersPerCourt + (court <= remainder ? 1 : 0);
    for (let i = 0; i < courtSize; i++) {
      if (playerIndex < sorted.length) {
        positions.push({
          playerId: sorted[playerIndex].id,
          courtNumber: court,
        });
        playerIndex++;
      }
    }
  }

  return positions;
}

/**
 * After a round, move winners up one court and losers down one court.
 * Court 1 winners stay. Bottom court losers stay.
 */
export function applyRoundResults(
  currentPositions: PlayerPosition[],
  results: MatchResult[],
  numCourts: number
): PlayerPosition[] {
  const winnerIds = new Set<string>();
  const loserIds = new Set<string>();

  for (const result of results) {
    if (result.team1Won) {
      result.team1PlayerIds.forEach((id) => winnerIds.add(id));
      result.team2PlayerIds.forEach((id) => loserIds.add(id));
    } else {
      result.team2PlayerIds.forEach((id) => winnerIds.add(id));
      result.team1PlayerIds.forEach((id) => loserIds.add(id));
    }
  }

  return currentPositions.map((pos) => {
    if (winnerIds.has(pos.playerId)) {
      // Winners move up (lower court number = better court)
      const newCourt = Math.max(1, pos.courtNumber - 1);
      return { ...pos, courtNumber: newCourt };
    } else if (loserIds.has(pos.playerId)) {
      // Losers move down
      const newCourt = Math.min(numCourts, pos.courtNumber + 1);
      return { ...pos, courtNumber: newCourt };
    }
    return pos;
  });
}

/**
 * Assign partners for each court, avoiding repeat pairings within the session.
 * Returns court assignments with team1 and team2 for each court.
 */
export function assignPartnersForRound(
  positions: PlayerPosition[],
  previousPairings: Map<string, Set<string>>,
  numCourts: number
): CourtAssignment[] {
  const assignments: CourtAssignment[] = [];

  for (let courtNum = 1; courtNum <= numCourts; courtNum++) {
    const courtPlayers = positions
      .filter((p) => p.courtNumber === courtNum)
      .map((p) => p.playerId);

    if (courtPlayers.length < 4) continue;

    // Try to find partner assignment avoiding repeats
    const pairing = findBestPairing(courtPlayers, previousPairings);
    assignments.push({
      courtNumber: courtNum,
      team1: pairing.team1,
      team2: pairing.team2,
    });
  }

  return assignments;
}

/**
 * Find the best 2v2 pairing for 4 players minimizing repeat partner pairings.
 * With 4 players A, B, C, D there are 3 possible pairings:
 *   (AB vs CD), (AC vs BD), (AD vs BC)
 */
function findBestPairing(
  players: string[],
  previousPairings: Map<string, Set<string>>
): { team1: string[]; team2: string[] } {
  if (players.length !== 4) {
    // Fallback for non-standard court sizes
    const mid = Math.floor(players.length / 2);
    return { team1: players.slice(0, mid), team2: players.slice(mid) };
  }

  const [a, b, c, d] = players;
  const options = [
    { team1: [a, b], team2: [c, d] },
    { team1: [a, c], team2: [b, d] },
    { team1: [a, d], team2: [b, c] },
  ];

  // Score each option by repeat pairings (lower = better)
  let bestOption = options[0];
  let bestScore = Infinity;

  for (const option of options) {
    let score = 0;
    const pairs = [
      [option.team1[0], option.team1[1]],
      [option.team2[0], option.team2[1]],
    ];
    for (const [p1, p2] of pairs) {
      if (previousPairings.get(p1)?.has(p2)) score++;
      if (previousPairings.get(p2)?.has(p1)) score++;
    }
    if (score < bestScore) {
      bestScore = score;
      bestOption = option;
      // Shuffle within teams for variety
      if (Math.random() > 0.5) bestOption.team1.reverse();
      if (Math.random() > 0.5) bestOption.team2.reverse();
    }
  }

  return bestOption;
}

/**
 * Update the pairings map after a round completes.
 */
export function updatePairings(
  pairings: Map<string, Set<string>>,
  assignments: CourtAssignment[]
): Map<string, Set<string>> {
  const updated = new Map(pairings);

  for (const assignment of assignments) {
    const addPair = (p1: string, p2: string) => {
      if (!updated.has(p1)) updated.set(p1, new Set());
      if (!updated.has(p2)) updated.set(p2, new Set());
      updated.get(p1)!.add(p2);
      updated.get(p2)!.add(p1);
    };

    if (assignment.team1.length >= 2) {
      addPair(assignment.team1[0], assignment.team1[1]);
    }
    if (assignment.team2.length >= 2) {
      addPair(assignment.team2[0], assignment.team2[1]);
    }
  }

  return updated;
}

/**
 * Calculate win percentage safely.
 */
export function winPercentage(wins: number, losses: number): number {
  const total = wins + losses;
  if (total === 0) return 0;
  return Math.round((wins / total) * 100) / 100;
}
