"use client";

import { useMemo, useState } from "react";
import { PlayerAvatar } from "@/components/player-avatar";
import {
  computeCourtPreview,
  type ConfirmedPlayer,
  type PreviewPlayer,
} from "@/lib/court-preview-math";

// Re-export the math + types so existing callers (and the unit tests
// at __tests__/court-preview.test.ts) don't need to change their
// import paths. The actual logic now lives in lib/court-preview-math.
export {
  computeCourtPreview,
  courtOptionsForCount,
  type ConfirmedPlayer,
  type PreviewPlayer,
} from "@/lib/court-preview-math";

interface MembershipRow {
  player_id: string;
  current_step: number;
  win_pct: number;
  total_sessions: number;
  last_played_at: string | null;
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
 * Court Preview section. Receives RAW confirmed roster + memberships so
 * the user can flip the court count via the dropdown without a server
 * round-trip — the seeding re-runs locally via computeCourtPreview.
 *
 * Court counts in the dropdown come from confirmed sign-ups only;
 * waitlist is excluded so the preview reflects the actual starting
 * roster, not a wishful one.
 */
export function CourtPreviewSection({
  confirmed,
  memberships,
  viewerPlayerId,
  viewMode,
}: {
  confirmed: ConfirmedPlayer[];
  memberships: MembershipRow[];
  viewerPlayerId: string | null;
  viewMode: "own" | "all";
}) {
  // Default to the maximum legal court count — same as Start Shootout.
  // null means "use the default", recomputed any time the roster shifts.
  const [forcedNumCourts, setForcedNumCourts] = useState<number | null>(null);

  const preview = useMemo(
    () => computeCourtPreview(confirmed, memberships, forcedNumCourts ?? undefined),
    [confirmed, memberships, forcedNumCourts]
  );

  if (!preview) return null;
  const { courts, numCourts, options } = preview;

  const showSelector = options.length > 1;
  const playersPerCourt = (n: number) => Math.floor(confirmed.length / n);
  const remainder = (n: number) => confirmed.length % n;
  const selectorLabel = (n: number) => {
    const base = playersPerCourt(n);
    const extra = remainder(n);
    if (extra === 0) return `${n} court${n === 1 ? "" : "s"} · ${base} players each`;
    return `${n} court${n === 1 ? "" : "s"} · ${base}–${base + 1} players each`;
  };

  const selector = showSelector ? (
    <label className="flex items-center gap-2 text-xs text-surface-muted">
      <span className="font-medium text-dark-200">Courts</span>
      <select
        value={numCourts}
        onChange={(e) => setForcedNumCourts(parseInt(e.target.value, 10))}
        className="input py-1 text-xs"
      >
        {options.map((n) => (
          <option key={n} value={n}>
            {selectorLabel(n)}
          </option>
        ))}
      </select>
    </label>
  ) : null;

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
          selector={selector}
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
        selector={selector}
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
  selector,
}: {
  title: string;
  subtitle: string;
  badge: string;
  selector?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <h2 className="text-sm font-semibold text-dark-100">{title}</h2>
        <p className="text-xs text-surface-muted max-w-xl">{subtitle}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {selector}
        <span className="badge-gray shrink-0">{badge}</span>
      </div>
    </header>
  );
}
