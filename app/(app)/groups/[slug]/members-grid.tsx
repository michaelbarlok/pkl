"use client";

import { useState } from "react";
import { PlayerAvatar } from "@/components/player-avatar";
import { cn, displaySessionsForGroup } from "@/lib/utils";

interface Member {
  player_id: string;
  current_step: number;
  win_pct: number;
  total_sessions: number;
  group_role?: string;
  last_played_at?: string | null;
  player: {
    display_name: string;
    avatar_url: string | null;
  } | null;
}

/**
 * Grid of member avatars that expand into a rich detail popover on
 * hover/focus/tap. We ship it as a tap-to-open popover rather than a pure
 * hover card so it works on touch devices too.
 */
export function MembersGrid({
  members,
  currentPlayerId,
  isFreePlay,
  // Group's rolling-point% window. Used to cap the displayed session
  // count — anything older than the window stops influencing the %
  // and showing it alongside implies otherwise.
  windowSize,
}: {
  members: Member[];
  currentPlayerId: string | null;
  isFreePlay: boolean;
  windowSize?: number | null;
}) {
  const [open, setOpen] = useState<string | null>(null);

  if (members.length === 0) {
    return (
      <p className="rounded-xl bg-surface-raised ring-1 ring-surface-border p-8 text-center text-sm text-surface-muted">
        No members yet.
      </p>
    );
  }

  return (
    <ul className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
      {members.map((m) => {
        const isMe = m.player_id === currentPlayerId;
        const isOpen = open === m.player_id;
        const name = m.player?.display_name ?? "Unknown";
        return (
          <li key={m.player_id} className="relative">
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : m.player_id)}
              onMouseEnter={() => setOpen(m.player_id)}
              onMouseLeave={() => setOpen(null)}
              className={cn(
                "group flex w-full flex-col items-center gap-2 rounded-xl p-3 transition-colors hover:bg-surface-overlay/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50",
                isMe && "bg-brand-500/5 ring-1 ring-brand-500/30"
              )}
            >
              <div className="relative">
                <PlayerAvatar
                  displayName={name}
                  avatarUrl={m.player?.avatar_url ?? null}
                  size="xl"
                />
                {m.group_role === "admin" && (
                  <span
                    className="absolute -top-1 -right-1 rounded-full bg-amber-400 text-amber-950 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 ring-2 ring-surface-raised"
                    title="Group admin"
                  >
                    Admin
                  </span>
                )}
              </div>
              <p className="text-xs font-medium text-dark-100 truncate w-full text-center">
                {name}
                {isMe && <span className="ml-1 text-[9px] text-brand-vivid uppercase tracking-wide">You</span>}
              </p>
              {!isFreePlay && (
                <p className="text-[10px] text-surface-muted">
                  Step {m.current_step} · {m.win_pct}%
                </p>
              )}
            </button>

            {isOpen && (
              <div
                role="dialog"
                className="absolute left-1/2 top-full z-30 mt-2 w-52 -translate-x-1/2 rounded-xl bg-surface-raised p-3 text-left ring-1 ring-surface-border shadow-xl animate-fade-in"
              >
                <div className="flex items-center gap-2">
                  <PlayerAvatar
                    displayName={name}
                    avatarUrl={m.player?.avatar_url ?? null}
                    size="md"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-dark-100 truncate">
                      {name}
                    </p>
                    {m.group_role === "admin" && (
                      <p className="text-[10px] uppercase tracking-wide text-amber-400 font-semibold">
                        Group admin
                      </p>
                    )}
                  </div>
                </div>
                {(() => {
                  const shown = displaySessionsForGroup(m.total_sessions, windowSize);
                  return !isFreePlay ? (
                    <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                      <div>
                        <dt className="text-[10px] uppercase text-surface-muted">Step</dt>
                        <dd className="text-sm font-bold text-dark-100">{m.current_step}</dd>
                      </div>
                      <div>
                        <dt className="text-[10px] uppercase text-surface-muted">Pt %</dt>
                        <dd className="text-sm font-bold text-dark-100">{m.win_pct}%</dd>
                      </div>
                      <div>
                        <dt className="text-[10px] uppercase text-surface-muted">Sess</dt>
                        <dd className="text-sm font-bold text-dark-100">{shown}</dd>
                      </div>
                    </dl>
                  ) : (
                    <p className="mt-3 text-xs text-surface-muted">
                      {shown} session{shown === 1 ? "" : "s"}
                    </p>
                  );
                })()}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
