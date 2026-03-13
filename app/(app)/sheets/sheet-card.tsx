"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

const statusBadge: Record<string, { className: string; label: string }> = {
  open: { className: "badge-green", label: "Open" },
  closed: { className: "badge-yellow", label: "Closed" },
  cancelled: { className: "badge-red", label: "Cancelled" },
};

interface SheetCardProps {
  sheetId: string;
  groupName: string;
  status: string;
  eventDate: string;
  location: string;
  playerLimit: number;
  confirmedCount: number;
  waitlistCount: number;
  players: { name: string; status: string }[];
  myStatus: string | null;
  signupClosed: boolean;
  withdrawClosed: boolean;
  isFull: boolean;
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
      <div className="flex items-center justify-between">
        <Link href={`/sheets/${sheetId}`} className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <p className="font-semibold text-dark-100">{groupName}</p>
            <span className={badge.className}>{badge.label}</span>
          </div>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-surface-muted">
            <span>{eventDate}</span>
            <span>{location}</span>
          </div>
        </Link>
        <div className="ml-4 flex items-center gap-3 shrink-0">
          <div className="text-right text-sm text-surface-muted">
            <span className="font-medium text-dark-100">{confirmedCount}</span>
            /{playerLimit} players
            {waitlistCount > 0 && (
              <span className="ml-1 text-accent-300">
                +{waitlistCount} waitlist
              </span>
            )}
          </div>
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
          ) : isOpen && !signupClosed ? (
            <button
              onClick={handleSignUp}
              disabled={loading}
              className="btn-primary text-xs px-3 py-1.5"
            >
              {loading ? "..." : isFull ? "Join Waitlist" : "Sign Up"}
            </button>
          ) : null}
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

      {expanded && (
        <div className="mt-3 border-t border-surface-border pt-3">
          {confirmedPlayers.length > 0 && (
            <div>
              <p className="text-xs font-medium uppercase text-surface-muted mb-1">
                Confirmed ({confirmedPlayers.length})
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-0.5">
                {confirmedPlayers.map((p, i) => (
                  <span key={i} className="text-sm text-dark-200 truncate">
                    {i + 1}. {p.name}
                  </span>
                ))}
              </div>
            </div>
          )}
          {waitlistedPlayers.length > 0 && (
            <div className={confirmedPlayers.length > 0 ? "mt-2" : ""}>
              <p className="text-xs font-medium uppercase text-surface-muted mb-1">
                Waitlist ({waitlistedPlayers.length})
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-0.5">
                {waitlistedPlayers.map((p, i) => (
                  <span key={i} className="text-sm text-accent-300 truncate">
                    {i + 1}. {p.name}
                  </span>
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
