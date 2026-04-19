import { PlayerAvatar } from "@/components/player-avatar";
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

/**
 * Given the ordered list of confirmed player ids and the matching memberships,
 * run the same Session 1 seeding used at start-time and return courts. Returns
 * null when there aren't enough players or when the counts don't divide into
 * a valid 4–5-per-court distribution.
 *
 * numCourts picks the MAX legal option so courts land on 4-per-court when
 * possible — which is what admins typically choose in start-shootout.tsx.
 */
export function computeCourtPreview(
  confirmed: Array<{ player_id: string; player?: { id?: string; display_name?: string; avatar_url?: string | null } }>,
  memberships: MembershipRow[],
): { courts: Array<{ courtNumber: number; players: PreviewPlayer[] }>; numCourts: number } | null {
  if (confirmed.length < 4) return null;

  // Same math as start-shootout's courtOptions, pick the largest.
  const options: number[] = [];
  for (let n = 1; n <= Math.floor(confirmed.length / 4); n++) {
    const perCourt = confirmed.length / n;
    if (perCourt >= 4 && perCourt <= 5) options.push(n);
  }
  if (options.length === 0) return null;
  const numCourts = options[options.length - 1];

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

  return { courts, numCourts };
}

/**
 * Visual card for a single court. `highlightPlayerId` bolds the viewer's name
 * when they're on this court so the "your court" view reads clearly.
 */
export function CourtCard({
  courtNumber,
  players,
  highlightPlayerId,
  label,
}: {
  courtNumber: number;
  players: PreviewPlayer[];
  highlightPlayerId?: string | null;
  label?: string;
}) {
  return (
    <div className="rounded-xl bg-surface-raised ring-1 ring-surface-border overflow-hidden">
      <div className="flex items-center justify-between border-b border-surface-border bg-surface-overlay/50 px-4 py-2">
        <p className="text-sm font-semibold text-dark-100">
          {label ?? `Court ${courtNumber}`}
        </p>
        <span className="text-[11px] font-medium uppercase tracking-wide text-surface-muted">
          {players.length} player{players.length === 1 ? "" : "s"}
        </span>
      </div>
      <ul className="divide-y divide-surface-border">
        {players.map((p) => {
          const isMe = highlightPlayerId && p.id === highlightPlayerId;
          return (
            <li
              key={p.id}
              className={`flex items-center gap-3 px-4 py-2 ${
                isMe ? "bg-brand-500/5" : ""
              }`}
            >
              <PlayerAvatar
                displayName={p.displayName}
                avatarUrl={p.avatarUrl}
                size="sm"
              />
              <div className="min-w-0 flex-1">
                <p
                  className={`text-sm truncate ${
                    isMe ? "font-semibold text-dark-100" : "text-dark-100"
                  }`}
                >
                  {p.displayName}
                  {isMe && (
                    <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wide text-brand-vivid">
                      You
                    </span>
                  )}
                </p>
              </div>
              <span className="shrink-0 text-xs text-surface-muted">
                Step {p.currentStep}
                <span className="mx-1 text-surface-border">·</span>
                {p.winPct}%
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Entire preview section. Renders either the viewer's own court
 * (`viewMode="own"`) or every court (`viewMode="all"` — admins). Returns null
 * when there's nothing to show.
 */
export function CourtPreviewSection({
  courts,
  numCourts,
  viewerPlayerId,
  viewMode,
}: {
  courts: Array<{ courtNumber: number; players: PreviewPlayer[] }>;
  numCourts: number;
  viewerPlayerId: string | null;
  viewMode: "own" | "all";
}) {
  if (viewMode === "own") {
    if (!viewerPlayerId) return null;
    const myCourt = courts.find((c) =>
      c.players.some((p) => p.id === viewerPlayerId)
    );
    if (!myCourt) return null;

    return (
      <section className="space-y-3">
        <SectionHeader
          title="Your court (preview)"
          subtitle={`If the shootout started now, here's who you'd be on court ${myCourt.courtNumber} with.`}
          badge={`${numCourts} court${numCourts === 1 ? "" : "s"} total`}
        />
        <CourtCard
          courtNumber={myCourt.courtNumber}
          players={myCourt.players}
          highlightPlayerId={viewerPlayerId}
          label={`Court ${myCourt.courtNumber}`}
        />
        <p className="text-xs text-surface-muted">
          Courts are seeded by step (lower first), then scoring %. Assignments
          can still shift if players sign up, withdraw, or an admin makes a
          change before the session starts.
        </p>
      </section>
    );
  }

  // admin view — all courts
  return (
    <section className="space-y-3">
      <SectionHeader
        title="Court preview"
        subtitle="Here's how the courts would seed if the shootout started right now."
        badge={`${numCourts} court${numCourts === 1 ? "" : "s"}`}
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {courts.map((c) => (
          <CourtCard
            key={c.courtNumber}
            courtNumber={c.courtNumber}
            players={c.players}
            highlightPlayerId={viewerPlayerId}
          />
        ))}
      </div>
      <p className="text-xs text-surface-muted">
        Seeded by step → scoring % → last played → total sessions. The real
        seeding runs again when you press <span className="font-medium text-dark-300">Start Shootout</span>,
        so any last-minute roster changes will be picked up.
      </p>
    </section>
  );
}

function SectionHeader({
  title,
  subtitle,
  badge,
}: {
  title: string;
  subtitle: string;
  badge: string;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <h2 className="text-sm font-semibold text-dark-100">{title}</h2>
        <p className="text-xs text-surface-muted max-w-xl">{subtitle}</p>
      </div>
      <span className="badge-gray shrink-0">{badge}</span>
    </header>
  );
}
