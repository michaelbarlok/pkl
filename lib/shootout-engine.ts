/**
 * Shootout Ladder Engine
 * Pure functions for the core ladder algorithm — fully unit testable.
 *
 * v2: Extended with distributeCourts, step movement, pool seeding,
 * same-day session detection, and tie-breaking per the v4 brief.
 */

// ============================================================
// Types
// ============================================================

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

export interface CourtDistribution {
  court: number;
  size: number;
}

export interface RankedPlayer {
  id: string;
  currentStep: number;
  winPct: number;
  lastPlayedAt: string | null;
  totalSessions: number;
}

export interface SeedablePlayer extends RankedPlayer {
  targetCourtNext?: number | null;
  seedSource: "previous_court" | "ranking_sheet";
  assignedCourt?: number;
}

export interface PoolResult {
  playerId: string;
  courtNumber: number;
  wins: number;
  pointDiff: number;
  h2hPoints: Map<string, number>;
  poolFinish?: number;
}

// ============================================================
// Court Distribution
// ============================================================

/**
 * Distribute players across courts.
 * Lower-numbered courts (best players) get 5 players first;
 * higher-numbered courts (weaker players) get 4.
 * Each court must have 4 or 5 players.
 */
export function distributeCourts(
  playerCount: number,
  numCourts: number
): CourtDistribution[] {
  const base = Math.floor(playerCount / numCourts);
  const extras = playerCount % numCourts;

  if (base < 4 || (base === 4 && extras > numCourts) || base > 5) {
    throw new Error(
      `Invalid distribution: ${playerCount} players across ${numCourts} courts requires 4-5 per court`
    );
  }

  // extras courts get (base+1) players — assigned to LOWEST court numbers
  return Array.from({ length: numCourts }, (_, i) => {
    const courtNum = i + 1;
    const isTopCourt = courtNum <= extras;
    return { court: courtNum, size: isTopCourt ? base + 1 : base };
  });
}

// ============================================================
// Session 1 Seeding (Standard Ranking Sheet Sort)
// ============================================================

/**
 * Sort players by ranking sheet order for session 1 of the day.
 * Step ASC → Win% DESC → Last Played DESC → Total Sessions DESC
 */
export function rankingSheetSort(players: RankedPlayer[]): RankedPlayer[] {
  return [...players].sort((a, b) => {
    // Step ASC (lower = better)
    if (a.currentStep !== b.currentStep) return a.currentStep - b.currentStep;
    // Win% DESC (higher = better)
    if (a.winPct !== b.winPct) return b.winPct - a.winPct;
    // Last Played DESC (more recent = better)
    const aTime = a.lastPlayedAt ? new Date(a.lastPlayedAt).getTime() : 0;
    const bTime = b.lastPlayedAt ? new Date(b.lastPlayedAt).getTime() : 0;
    if (aTime !== bTime) return bTime - aTime;
    // Total Sessions DESC
    return b.totalSessions - a.totalSessions;
  });
}

/**
 * Seed players to courts for Session 1 of the day using ranking sheet sort.
 */
export function seedSession1(
  players: RankedPlayer[],
  numCourts: number
): PlayerPosition[] {
  const sorted = rankingSheetSort(players);
  const courts = distributeCourts(sorted.length, numCourts);
  const positions: PlayerPosition[] = [];
  let playerIdx = 0;

  for (const court of courts) {
    for (let i = 0; i < court.size; i++) {
      if (playerIdx < sorted.length) {
        positions.push({
          playerId: sorted[playerIdx].id,
          courtNumber: court.court,
        });
        playerIdx++;
      }
    }
  }

  return positions;
}

// ============================================================
// Same-Day Session Seeding (Previous Court Anchor)
// ============================================================

/**
 * Seed players for Session 2+ of the same day using previous court anchors.
 * Players with a target_court_next are anchored; new joiners fall back to ranking sort.
 */
export function seedSameDaySession(
  players: SeedablePlayer[],
  numCourts: number
): PlayerPosition[] {
  const courts = distributeCourts(players.length, numCourts);
  const courtSizes = new Map(courts.map((c) => [c.court, c.size]));

  // Separate anchored and non-anchored players
  const anchored = players
    .filter((p) => p.seedSource === "previous_court" && p.targetCourtNext != null)
    .map((p) => ({
      ...p,
      assignedCourt: Math.max(1, Math.min(numCourts, p.targetCourtNext!)),
    }));

  const nonAnchored = rankingSheetSort(
    players.filter(
      (p) => p.seedSource === "ranking_sheet" || p.targetCourtNext == null
    )
  );

  // Build court pools with anchored players
  const courtPools = new Map<number, RankedPlayer[]>();
  for (let c = 1; c <= numCourts; c++) courtPools.set(c, []);

  for (const p of anchored) {
    courtPools.get(p.assignedCourt!)!.push(p);
  }

  // Insert non-anchored players into courts that have space
  for (const p of nonAnchored) {
    // Find the court where this player's step/% would place them
    let bestCourt = 1;
    for (let c = 1; c <= numCourts; c++) {
      const pool = courtPools.get(c)!;
      if (pool.length < courtSizes.get(c)!) {
        bestCourt = c;
        break;
      }
    }
    // If best court is full, find any court with space
    if (courtPools.get(bestCourt)!.length >= courtSizes.get(bestCourt)!) {
      for (let c = numCourts; c >= 1; c--) {
        if (courtPools.get(c)!.length < courtSizes.get(c)!) {
          bestCourt = c;
          break;
        }
      }
    }
    courtPools.get(bestCourt)!.push(p);
  }

  // Resolve overflow: shift non-anchored players from overfull courts
  resolveOverflow(courtPools, courtSizes, numCourts);

  // Flatten to positions
  const positions: PlayerPosition[] = [];
  for (const [courtNum, pool] of courtPools) {
    for (const p of pool) {
      positions.push({ playerId: p.id, courtNumber: courtNum });
    }
  }

  return positions;
}

/**
 * Resolve overflow when courts exceed their target size.
 * Non-anchored players shift first; anchored players are immovable.
 */
function resolveOverflow(
  courtPools: Map<number, RankedPlayer[]>,
  courtSizes: Map<number, number>,
  numCourts: number
): void {
  for (let c = 1; c <= numCourts; c++) {
    const pool = courtPools.get(c)!;
    const targetSize = courtSizes.get(c)!;

    while (pool.length > targetSize) {
      // Find a non-anchored player to shift
      const shiftIdx = pool.findIndex(
        (p) => {
          const sp = p as SeedablePlayer;
          return sp.seedSource === "ranking_sheet" || sp.targetCourtNext == null;
        }
      );

      if (shiftIdx === -1) {
        // All anchored — shift worst tiebreak rank among non-1st finishers
        const worst = pool[pool.length - 1];
        pool.pop();
        const nextCourt = Math.min(c + 1, numCourts);
        if (nextCourt !== c) {
          courtPools.get(nextCourt)!.push(worst);
        }
      } else {
        const player = pool.splice(shiftIdx, 1)[0];
        // Push to next court
        const nextCourt = Math.min(c + 1, numCourts);
        if (nextCourt !== c) {
          courtPools.get(nextCourt)!.push(player);
        }
      }
    }
  }
}

// ============================================================
// Step Movement
// ============================================================

/**
 * Compute target court for next session based on pool finish.
 * 1st place: court - 1 (move up)
 * Middle finishers: stay
 * Last place: court + 1 (move down)
 */
export function computeTargetCourt(
  courtNumber: number,
  poolFinish: number,
  poolSize: number,
  _numCourts?: number
): number {
  let target = courtNumber;

  if (poolFinish === 1) {
    target = courtNumber - 1;
  } else if (poolFinish === poolSize) {
    target = courtNumber + 1;
  }
  // Middle finishers stay

  return Math.max(1, target); // Floor at court 1, no ceiling cap
}

/**
 * Compute new step after a round.
 * 1st place moves up by stepMoveUp, last place moves down by stepMoveDown.
 */
export function computeNewStep(
  currentStep: number,
  poolFinish: number,
  poolSize: number,
  stepMoveUp: number,
  stepMoveDown: number,
  minStep: number
): number {
  if (poolFinish === 1) {
    return Math.max(minStep, currentStep - stepMoveUp);
  }
  if (poolFinish === poolSize) {
    return currentStep + stepMoveDown;
  }
  return currentStep; // Middle finishers unchanged
}

// ============================================================
// Tie-Breaking Within a Pool
// ============================================================

/**
 * Rank players within a pool using tie-breaking rules:
 * 1. Most wins
 * 2. Highest total point differential
 * 3. Most head-to-head points against tied opponent
 * 4. Random
 */
export function rankPoolResults(results: PoolResult[]): PoolResult[] {
  const sorted = [...results].sort((a, b) => {
    // 1. Most wins
    if (a.wins !== b.wins) return b.wins - a.wins;
    // 2. Highest point differential
    if (a.pointDiff !== b.pointDiff) return b.pointDiff - a.pointDiff;
    // 3. Head-to-head points
    const aH2H = a.h2hPoints.get(b.playerId) ?? 0;
    const bH2H = b.h2hPoints.get(a.playerId) ?? 0;
    if (aH2H !== bH2H) return bH2H - aH2H;
    // 4. Random
    return Math.random() - 0.5;
  });

  return sorted.map((r, i) => ({ ...r, poolFinish: i + 1 }));
}

// ============================================================
// Legacy Functions (Preserved from v1)
// ============================================================

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

  const sorted = [...players].sort((a, b) => {
    if (a.skill_rating == null && b.skill_rating == null) return 0;
    if (a.skill_rating == null) return 1;
    if (b.skill_rating == null) return -1;
    return b.skill_rating - a.skill_rating;
  });

  const positions: PlayerPosition[] = [];
  let playerIndex = 0;

  for (let court = 1; court <= numCourts; court++) {
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
      const newCourt = Math.max(1, pos.courtNumber - 1);
      return { ...pos, courtNumber: newCourt };
    } else if (loserIds.has(pos.playerId)) {
      const newCourt = Math.min(numCourts, pos.courtNumber + 1);
      return { ...pos, courtNumber: newCourt };
    }
    return pos;
  });
}

/**
 * Assign partners for each court, avoiding repeat pairings within the session.
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

    const pairing = findBestPairing(courtPlayers, previousPairings);
    assignments.push({
      courtNumber: courtNum,
      team1: pairing.team1,
      team2: pairing.team2,
    });
  }

  return assignments;
}

function findBestPairing(
  players: string[],
  previousPairings: Map<string, Set<string>>
): { team1: string[]; team2: string[] } {
  if (players.length !== 4) {
    const mid = Math.floor(players.length / 2);
    return { team1: players.slice(0, mid), team2: players.slice(mid) };
  }

  const [a, b, c, d] = players;
  const options = [
    { team1: [a, b], team2: [c, d] },
    { team1: [a, c], team2: [b, d] },
    { team1: [a, d], team2: [b, c] },
  ];

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
