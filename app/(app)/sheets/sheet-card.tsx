"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

const statusBadge: Record<string, { className: string; label: string }> = {
  open: { className: "badge-green", label: "Open" },
  closed: { className: "badge-yellow", label: "Closed" },
  cancelled: { className: "badge-red", label: "Cancelled" },
};

interface PlayerInfo {
  name: string;
  status: string;
  avatarUrl: string | null;
}

interface SheetCardProps {
  sheetId: string;
  groupName: string;
  status: string;
  eventDate: string;
  location: string;
  playerLimit: number;
  confirmedCount: number;
  waitlistCount: number;
  players: PlayerInfo[];
  myStatus: string | null;
  signupClosed: boolean;
  withdrawClosed: boolean;
  isFull: boolean;
}

function PlayerAvatar({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt=""
        className="h-7 w-7 rounded-full object-cover shrink-0"
      />
    );
  }
  return (
    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-overlay text-xs font-medium text-surface-muted shrink-0">
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

export function SheetCard({
  sheetId,
  groupName,
  status,
  eventDate,
  location,
  playerLimit,
  confirmedCount,
  waitlistCount,
  players,
  myStatus,
  signupClosed,
  withdrawClosed,
  isFull,
}: SheetCardProps) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const badge = statusBadge[status] ?? statusBadge.closed;
  const isOpen = status === "open";
  const isRegistered = myStatus === "confirmed" || myStatus === "waitlist";

  const confirmedPlayers = players.filter((p) => p.status === "confirmed");
  const waitlistedPlayers = players.filter((p) => p.status === "waitlist");

  async function handleSignUp(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setLoading(true);
    try {
      const res = await fetch(`/api/sheets/${sheetId}/signup`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Failed to sign up.");
      }
      router.refresh();
    } catch {
      alert("Failed to sign up.");
    } finally {
      setLoading(false);
    }
  }

  async function handleWithdraw(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setLoading(true);
    try {
      const res = await fetch(`/api/sheets/${sheetId}/withdraw`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Failed to withdraw.");
      }
      router.refresh();
    } catch {
      alert("Failed to withdraw.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card hover:ring-brand-500/30 transition-shadow">
      {/* Row 1: Title + status badge, player count + chevron */}
      <div className="flex items-start justify-between gap-3">
        <Link href={`/sheets/${sheetId}`} className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-dark-100">{groupName}</p>
            <span className={badge.className}>{badge.label}</span>
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-surface-muted">
            <span>{eventDate}</span>
            <span>{location}</span>
          </div>
        </Link>
        <div className="flex items-center gap-2 shrink-0">
          <div className="text-right text-sm text-surface-muted whitespace-nowrap">
            <span className="font-medium text-dark-100">{confirmedCount}</span>
            /{playerLimit}
            {waitlistCount > 0 && (
              <span className="ml-1 text-accent-300">
                +{waitlistCount}
              </span>
            )}
          </div>
          {players.length > 0 && (
            <button
              onClick={(e) => {
                e.preventDefault();
                setExpanded(!expanded);
              }}
              className="text-surface-muted hover:text-dark-100 transition-colors p-1"
              aria-label={expanded ? "Collapse player list" : "Expand player list"}
            >
              <svg
                className={`h-5 w-5 transition-transform ${expanded ? "rotate-180" : ""}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Row 2: Actions (sign up / withdraw) */}
      {(isRegistered || isOpen) && (
        <div className="mt-2 flex items-center gap-2 flex-wrap">
          {isRegistered ? (
            <>
              <span className={myStatus === "confirmed" ? "badge-green" : "badge-yellow"}>
                {myStatus === "confirmed" ? "Signed Up" : "Waitlisted"}
              </span>
              {!withdrawClosed && (
                <button
                  onClick={handleWithdraw}
                  disabled={loading}
                  className="btn-danger text-xs px-3 py-1.5"
                >
                  {loading ? "..." : "Withdraw"}
                </button>
              )}
            </>
          ) : signupClosed ? (
            <span className="text-xs text-surface-muted">Sign-up closed</span>
          ) : (
            <button
              onClick={handleSignUp}
              disabled={loading}
              className="btn-primary text-xs px-3 py-1.5"
            >
              {loading ? "..." : isFull ? "Join Waitlist" : "Sign Up"}
            </button>
          )}
        </div>
      )}

      {/* Expandable player list — single column with avatars */}
      {expanded && (
        <div className="mt-3 border-t border-surface-border pt-3 space-y-3">
          {confirmedPlayers.length > 0 && (
            <div>
              <p className="text-xs font-medium uppercase text-surface-muted mb-2">
                Confirmed ({confirmedPlayers.length})
              </p>
              <div className="space-y-1.5">
                {confirmedPlayers.map((p, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-xs text-surface-muted w-5 text-right shrink-0">
                      {i + 1}.
                    </span>
                    <PlayerAvatar name={p.name} avatarUrl={p.avatarUrl} />
                    <span className="text-sm text-dark-200 truncate">{p.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {waitlistedPlayers.length > 0 && (
            <div>
              <p className="text-xs font-medium uppercase text-surface-muted mb-2">
                Waitlist ({waitlistedPlayers.length})
              </p>
              <div className="space-y-1.5">
                {waitlistedPlayers.map((p, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-xs text-surface-muted w-5 text-right shrink-0">
                      {i + 1}.
                    </span>
                    <PlayerAvatar name={p.name} avatarUrl={p.avatarUrl} />
                    <span className="text-sm text-accent-300 truncate">{p.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {players.length === 0 && (
            <p className="text-sm text-surface-muted">No players signed up yet.</p>
          )}
        </div>
      )}
    </div>
  );
}
