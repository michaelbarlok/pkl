/**
 * Shared pool-standings computation.
 *
 * Mirrors the server-side sort in lib/session-recompute.ts so the
 * live display (Play tab, Admin > Sessions) never contradicts the
 * final pool_finish the server will eventually write.
 *
 * Tiebreaker stack (in order):
 *   1. Wins (desc)
 *   2. Total point differential (desc)
 *   3. Head-to-head record — wins minus losses against the OTHER tied
 *      player specifically (desc). If they split, fall through.
 *   4. Head-to-head point margin — sum of (my score − opp score) across
 *      every match they played on opposite teams (desc).
 *   5. Lower pre-session overall step (asc).
 *   6. Higher pre-session Points % (desc). Last resort.
 *
 * Each standing is annotated with `tiebreakerReason` when it benefited
 * from a tiebreaker against the player immediately below it. The
 * reason names the specific sub-step that decided the tie (e.g.
 * "Won head-to-head record (2-0)" vs. "Better head-to-head point
 * margin (+3)") so players can see exactly why one advanced.
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

type H2H = { wins: number; losses: number; pointDiff: number };

export function computePoolStandings(
  players: PlayerRef[],
  scores: GameRef[],
  memberMap?: Map<string, RankedMember>,
  /**
   * Optional authoritative ordering keyed by player_id. When the
   * server has already stamped session_participants.pool_finish (i.e.
   * the round is complete), pass it here so the client display
   * matches the server's ranking exactly. Without this, the client's
   * step/winPct fallback can disagree with the server's because the
   * server tiebroke using PRE-session step/win_pct snapshots while
   * the client reads CURRENT (post-session) values from
   * group_memberships. The mismatch is invisible most of the time
   * but bites when three players finish a court tied — the next-court
   * arrows (driven by server's pool_finish) end up next to the wrong
   * row in the table.
   */
  poolFinishMap?: Map<string, number>,
): PoolStanding[] {
  type Internal = PoolStanding & { h2h: Map<string, H2H> };
  const standings = new Map<string, Internal>();

  for (const p of players) {
    standings.set(p.player_id, {
      playerId: p.player_id,
      displayName: p.player?.display_name ?? "Unknown",
      wins: 0,
      losses: 0,
      pointDiff: 0,
      tiebreakerReason: null,
      h2h: new Map(),
    });
  }

  // Per-pair head-to-head bookkeeping. For every match where players
  // X and Y are on opposite teams, both X.h2h[Y] and Y.h2h[X] get a
  // wins/losses bump and a pointDiff delta. That lets the comparator
  // ask "did A beat B head-to-head?" and "by how much?" separately.
  for (const game of scores) {
    const teamAIds = [game.team_a_p1, game.team_a_p2].filter(Boolean) as string[];
    const teamBIds = [game.team_b_p1, game.team_b_p2].filter(Boolean) as string[];
    const aWon = game.score_a > game.score_b;
    const bWon = game.score_b > game.score_a;

    for (const pid of teamAIds) {
      const s = standings.get(pid);
      if (!s) continue;
      if (aWon) s.wins++;
      else if (bWon) s.losses++;
      s.pointDiff += game.score_a - game.score_b;
      for (const opp of teamBIds) {
        const h = s.h2h.get(opp) ?? { wins: 0, losses: 0, pointDiff: 0 };
        if (aWon) h.wins++;
        else if (bWon) h.losses++;
        h.pointDiff += game.score_a - game.score_b;
        s.h2h.set(opp, h);
      }
    }

    for (const pid of teamBIds) {
      const s = standings.get(pid);
      if (!s) continue;
      if (bWon) s.wins++;
      else if (aWon) s.losses++;
      s.pointDiff += game.score_b - game.score_a;
      for (const opp of teamAIds) {
        const h = s.h2h.get(opp) ?? { wins: 0, losses: 0, pointDiff: 0 };
        if (bWon) h.wins++;
        else if (aWon) h.losses++;
        h.pointDiff += game.score_b - game.score_a;
        s.h2h.set(opp, h);
      }
    }
  }

  const sorted = Array.from(standings.values()).sort((a, b) => {
    // Authoritative override: when the server has stamped pool_finish
    // we trust it. Skipping the live tiebreaker chain here is what
    // keeps client display consistent with the server's "Next Court"
    // arrows after round_complete.
    if (poolFinishMap) {
      const aF = poolFinishMap.get(a.playerId);
      const bF = poolFinishMap.get(b.playerId);
      if (aF != null && bF != null && aF !== bF) return aF - bF;
      // If only one side has pool_finish (shouldn't happen in practice
      // — server stamps the whole court at once) fall through to the
      // live algorithm below for a deterministic order.
    }

    if (a.wins !== b.wins) return b.wins - a.wins;
    if (a.pointDiff !== b.pointDiff) return b.pointDiff - a.pointDiff;

    const aH = a.h2h.get(b.playerId) ?? { wins: 0, losses: 0, pointDiff: 0 };
    const bH = b.h2h.get(a.playerId) ?? { wins: 0, losses: 0, pointDiff: 0 };

    // 3. Head-to-head record (wins minus losses against the other player)
    const aRec = aH.wins - aH.losses;
    const bRec = bH.wins - bH.losses;
    if (aRec !== bRec) return bRec - aRec;

    // 4. Head-to-head point margin (only meaningful when h2h W-L split)
    if (aH.pointDiff !== bH.pointDiff) return bH.pointDiff - aH.pointDiff;

    const mA = memberMap?.get(a.playerId) ?? { step: 99, winPct: 0 };
    const mB = memberMap?.get(b.playerId) ?? { step: 99, winPct: 0 };
    if (mA.step !== mB.step) return mA.step - mB.step;
    return mB.winPct - mA.winPct;
  });

  // Walk adjacent pairs. When wins + total point-diff are equal, name
  // the specific sub-step of the head-to-head tiebreaker that decided
  // it so the higher-ranked player's badge tells the whole story.
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (a.wins !== b.wins) continue;
    if (a.pointDiff !== b.pointDiff) continue;

    const aH = a.h2h.get(b.playerId) ?? { wins: 0, losses: 0, pointDiff: 0 };
    const bH = b.h2h.get(a.playerId) ?? { wins: 0, losses: 0, pointDiff: 0 };

    const aRec = aH.wins - aH.losses;
    const bRec = bH.wins - bH.losses;
    if (aRec !== bRec) {
      a.tiebreakerReason = `Won head-to-head record (${aH.wins}-${aH.losses})`;
      continue;
    }

    if (aH.pointDiff !== bH.pointDiff) {
      const sign = aH.pointDiff > 0 ? "+" : "";
      a.tiebreakerReason = `Better head-to-head point margin (${sign}${aH.pointDiff})`;
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

  // Strip the internal h2h field before returning.
  return sorted.map(({ h2h: _omit, ...rest }) => rest);
}
