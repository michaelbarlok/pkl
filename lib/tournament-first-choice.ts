import { computeBalancedFirstChoices } from "./first-choice";

/**
 * First-choice picker for tournament matches.
 *
 * Two modes by match phase:
 *
 *   - **Pool play** (round-robin within a pool): balanced per team.
 *     Walks the pool's matches in (round, match_number) order and
 *     picks the team whose anchor has fewer first-choice wins so far.
 *     Mirrors the ladder/free-play logic — each team should get
 *     first-choice in roughly half their pool games.
 *
 *   - **Playoffs** (bracket-style elimination): higher seed always
 *     gets first-choice. The team whose registration carries the
 *     lower `seed` number wins it. Falls back to the hash of the
 *     match id when seeds aren't set or are tied (e.g. very early
 *     bracket where a winner-yet-to-be-determined is still null).
 *
 * Pool-play classification is done by tournament format:
 *   - round_robin: matches in `pool_*`, `winners`, or `losers` are
 *     pool play; `playoff` (and `grand_final`) are seeded.
 *   - single_elimination / double_elimination: every match is a
 *     bracket match → seeded.
 */

export interface TournamentMatchInput {
  id: string;
  bracket: string;
  division: string | null;
  round: number;
  match_number: number;
  player1_id: string | null;
  player2_id: string | null;
}

export type TournamentFormat =
  | "round_robin"
  | "single_elimination"
  | "double_elimination";

interface RegistrationSeedRow {
  player_id: string;
  division: string | null;
  seed: number | null;
}

function isPoolPlayBracket(bracket: string): boolean {
  return (
    bracket.startsWith("pool_") ||
    bracket === "winners" ||
    bracket === "losers"
  );
}

function fallbackHash(input: string): "team1" | "team2" {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return ((h >>> 0) & 1) === 0 ? "team1" : "team2";
}

export function buildTournamentFirstChoiceMap(
  matches: readonly TournamentMatchInput[],
  registrations: readonly RegistrationSeedRow[],
  format: TournamentFormat,
): Map<string, "team1" | "team2"> {
  const result = new Map<string, "team1" | "team2">();

  // Build per-(division, anchor) seed map. Same anchor can appear in
  // multiple divisions (rare but possible) so we key by both.
  const seedMap = new Map<string, number>();
  for (const r of registrations) {
    if (r.seed == null) continue;
    const key = `${r.division ?? ""}:${r.player_id}`;
    seedMap.set(key, r.seed);
  }

  // Bucket pool-play matches by (division, bracket) for the balanced
  // walk. Playoff/elimination matches are handled one-off.
  const poolBuckets = new Map<string, TournamentMatchInput[]>();
  const playoffMatches: TournamentMatchInput[] = [];
  const treatAllAsBracket =
    format === "single_elimination" || format === "double_elimination";

  for (const m of matches) {
    if (!m.player1_id || !m.player2_id) continue;
    if (treatAllAsBracket || !isPoolPlayBracket(m.bracket)) {
      playoffMatches.push(m);
    } else {
      const key = `${m.division ?? ""}:${m.bracket}`;
      const arr = poolBuckets.get(key) ?? [];
      arr.push(m);
      poolBuckets.set(key, arr);
    }
  }

  // Pool play: balance walk per bucket.
  for (const [, bucket] of poolBuckets) {
    bucket.sort((a, b) =>
      a.round !== b.round
        ? a.round - b.round
        : a.match_number - b.match_number,
    );
    const balanceable = bucket.map((m) => ({
      _m: m,
      team1: [m.player1_id!],
      team2: [m.player2_id!],
    }));
    const { assignments } = computeBalancedFirstChoices(
      balanceable,
      (b) => b._m.id,
    );
    for (const [b, pick] of assignments) {
      result.set(b._m.id, pick);
    }
  }

  // Playoffs: higher seed (lower seed number) wins first-choice.
  for (const m of playoffMatches) {
    const k1 = `${m.division ?? ""}:${m.player1_id}`;
    const k2 = `${m.division ?? ""}:${m.player2_id}`;
    const s1 = seedMap.get(k1);
    const s2 = seedMap.get(k2);
    if (s1 != null && s2 != null && s1 !== s2) {
      result.set(m.id, s1 < s2 ? "team1" : "team2");
    } else {
      // No seed info or seeds tied — fall back to a stable hash of
      // the match id so the label is consistent across reloads.
      result.set(m.id, fallbackHash(m.id));
    }
  }

  return result;
}
