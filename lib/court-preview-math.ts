/**
 * Pure court-preview math.
 *
 * Lives in /lib (not inside the sheet route) because the preview UI
 * runs as a client component — a dropdown lets the admin pick among
 * legal court counts and re-seed — so the math has to be safe to
 * import in both server and client trees. No React imports here.
 *
 * `computeCourtPreview` wraps seedSession1 (the real shootout engine)
 * so what you see in the preview matches exactly what Start Shootout
 * will produce. Courts are derived from CONFIRMED sign-ups only —
 * waitlist is intentionally excluded, so the preview shows the real
 * starting 12/16/20 and not a hopeful-but-fictional 24.
 */
import { seedSession1, type RankedPlayer } from "@/lib/shootout-engine";

interface MembershipRow {
  player_id: string;
  current_step: number;
  win_pct: number;
  total_sessions: number;
  last_played_at: string | null;
}

export interface PreviewPlayer {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  currentStep: number;
  winPct: number;
}

export interface ConfirmedPlayer {
  player_id: string;
  player?: {
    id?: string;
    display_name?: string;
    avatar_url?: string | null;
  };
}

/** Legal court counts for a given confirmed-player total. Each option
 *  keeps every court at 4 or 5 players. The max option is 4-per-court;
 *  smaller options move toward 5-per-court. */
export function courtOptionsForCount(playerCount: number): number[] {
  const options: number[] = [];
  for (let n = 1; n <= Math.floor(playerCount / 4); n++) {
    const perCourt = playerCount / n;
    if (perCourt >= 4 && perCourt <= 5) options.push(n);
  }
  return options;
}

/**
 * Run Session-1 seeding for the given confirmed roster.
 *
 * If `forcedNumCourts` is a legal option it's used; otherwise the
 * default is the FEWEST courts with the MOST players each — e.g. 30
 * confirmed defaults to 6 courts of 5 rather than 7 courts of 4–5.
 * That matches how most leagues prefer to play (full 5-person pools
 * over thinner 4-person pools). The admin can still flip to a
 * different court count via the preview dropdown.
 *
 * Returns null when there are too few players (<4) or no legal 4-5
 * split works for the roster size.
 */
export function computeCourtPreview(
  confirmed: ConfirmedPlayer[],
  memberships: MembershipRow[],
  forcedNumCourts?: number
): {
  courts: Array<{ courtNumber: number; players: PreviewPlayer[] }>;
  numCourts: number;
  options: number[];
} | null {
  if (confirmed.length < 4) return null;

  const options = courtOptionsForCount(confirmed.length);
  if (options.length === 0) return null;

  // `courtOptionsForCount` loops n from 1 upward, so options[0] is
  // the smallest legal court count — i.e. the most-players-per-court
  // split.
  const numCourts =
    forcedNumCourts && options.includes(forcedNumCourts)
      ? forcedNumCourts
      : options[0];

  const membershipByPlayer = new Map(memberships.map((m) => [m.player_id, m]));

  const ranked: RankedPlayer[] = confirmed.map((r) => {
    const m = membershipByPlayer.get(r.player_id);
    return {
      id: r.player_id,
      currentStep: m?.current_step ?? 99,
      winPct: m?.win_pct ?? 0,
      lastPlayedAt: m?.last_played_at ?? null,
      totalSessions: m?.total_sessions ?? 0,
    };
  });

  const positions = seedSession1(ranked, numCourts);

  // Build a lookup of roster info so we can attach name/avatar to each seat.
  const playerById = new Map<string, PreviewPlayer>();
  for (const r of confirmed) {
    const m = membershipByPlayer.get(r.player_id);
    playerById.set(r.player_id, {
      id: r.player_id,
      displayName: r.player?.display_name ?? "Unknown",
      avatarUrl: r.player?.avatar_url ?? null,
      currentStep: m?.current_step ?? 99,
      winPct: m?.win_pct ?? 0,
    });
  }

  // Group positions by court, preserving the seeded order within each court.
  const byCourt = new Map<number, PreviewPlayer[]>();
  for (const pos of positions) {
    const player = playerById.get(pos.playerId);
    if (!player) continue;
    const list = byCourt.get(pos.courtNumber) ?? [];
    list.push(player);
    byCourt.set(pos.courtNumber, list);
  }

  const courts = Array.from(byCourt.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([courtNumber, players]) => ({ courtNumber, players }));

  return { courts, numCourts, options };
}
