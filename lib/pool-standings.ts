/**
 * Shared pool-standings computation.
 *
 * Mirrors the server-side sort in lib/session-recompute.ts so the
 * live display (Play tab, Admin > Sessions) never contradicts the
 * final pool_finish the server will eventually write.
 *
 * Tiebreaker stack (in order):
 *   1. Wins (desc)
 *   2. Point differential (desc)
 *   3. Head-to-head points — total points the two tied players
 *      scored against each other across their direct matchups (desc).
 *   4. Lower pre-session overall step (asc). The player who stood
 *      higher on the group's overall ladder before this session
 *      wins the tie.
 *   5. Higher pre-session Points % (desc). Last-resort when even
 *      steps are identical.
 *
 * Each standing is annotated with `tiebreakerReason` when it benefited
 * from a tiebreaker against the player immediately below it. UIs can
 * render that reason as a small note next to the name so players
 * understand why they got the edge.
 */

export interface PoolStanding {
  playerId: string;
  displayName: string;
  wins: number;
  losses: number;
  pointDiff: number;
  /** Short, user-facing note describing why this player beat the
   *  player ranked directly below them in a tie. Null when no
   *  tiebreaker applied (or when the tiebreaker couldn't be
   *  determined — e.g. truly identical across every metric). */
  tiebreakerReason: string | null;
}

/** Pre-session overall-ranking snapshot keyed by player id. Used as
 *  the last two steps of the tiebreaker. */
export type RankedMember = { step: number; winPct: number };

interface PlayerRef {
  player_id: string;
  player?: { display_name?: string | null } | null;
}

interface GameRef {
  team_a_p1?: string | null;
  team_a_p2?: string | null;
  team_b_p1?: string | null;
  team_b_p2?: string | null;
  score_a: number;
  score_b: number;
}

export function computePoolStandings(
  players: PlayerRef[],
  scores: GameRef[],
  memberMap?: Map<string, RankedMember>
): PoolStanding[] {
  type Internal = PoolStanding & { h2hPoints: Map<string, number> };
  const standings = new Map<string, Internal>();

  for (const p of players) {
    standings.set(p.player_id, {
      playerId: p.player_id,
      displayName: p.player?.display_name ?? "Unknown",
      wins: 0,
      losses: 0,
      pointDiff: 0,
      tiebreakerReason: null,
      h2hPoints: new Map(),
    });
  }

  for (const game of scores) {
    const teamAIds = [game.team_a_p1, game.team_a_p2].filter(Boolean) as string[];
    const teamBIds = [game.team_b_p1, game.team_b_p2].filter(Boolean) as string[];
    const aWon = game.score_a > game.score_b;

    for (const pid of teamAIds) {
      const s = standings.get(pid);
      if (!s) continue;
      if (aWon) s.wins++;
      else s.losses++;
      s.pointDiff += game.score_a - game.score_b;
      for (const opp of teamBIds) {
        s.h2hPoints.set(opp, (s.h2hPoints.get(opp) ?? 0) + game.score_a);
      }
    }

    for (const pid of teamBIds) {
      const s = standings.get(pid);
      if (!s) continue;
      if (!aWon) s.wins++;
      else s.losses++;
      s.pointDiff += game.score_b - game.score_a;
      for (const opp of teamAIds) {
        s.h2hPoints.set(opp, (s.h2hPoints.get(opp) ?? 0) + game.score_b);
      }
    }
  }

  const sorted = Array.from(standings.values()).sort((a, b) => {
    if (a.wins !== b.wins) return b.wins - a.wins;
    if (a.pointDiff !== b.pointDiff) return b.pointDiff - a.pointDiff;
    const aH2H = a.h2hPoints.get(b.playerId) ?? 0;
    const bH2H = b.h2hPoints.get(a.playerId) ?? 0;
    if (aH2H !== bH2H) return bH2H - aH2H;
    const mA = memberMap?.get(a.playerId) ?? { step: 99, winPct: 0 };
    const mB = memberMap?.get(b.playerId) ?? { step: 99, winPct: 0 };
    if (mA.step !== mB.step) return mA.step - mB.step;
    return mB.winPct - mA.winPct;
  });

  // Walk adjacent pairs. When W + point-diff are equal, annotate the
  // higher-ranked player (sorted[i]) with the reason they beat the
  // player below them (sorted[i+1]).
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (a.wins !== b.wins) continue;
    if (a.pointDiff !== b.pointDiff) continue;

    const aH2H = a.h2hPoints.get(b.playerId) ?? 0;
    const bH2H = b.h2hPoints.get(a.playerId) ?? 0;
    if (aH2H !== bH2H) {
      a.tiebreakerReason = "Won head-to-head";
      continue;
    }

    const mA = memberMap?.get(a.playerId);
    const mB = memberMap?.get(b.playerId);
    if (mA && mB) {
      if (mA.step !== mB.step) {
        a.tiebreakerReason = "Higher overall rank";
        continue;
      }
      if (mA.winPct !== mB.winPct) {
        a.tiebreakerReason = "Higher Points %";
        continue;
      }
    }
    // Fully tied on every metric — leave null; order is stable from
    // sort but effectively arbitrary at this point.
  }

  // Strip the internal h2hPoints field before returning.
  return sorted.map(({ h2hPoints: _omit, ...rest }) => rest);
}
