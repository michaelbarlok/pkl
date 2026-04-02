"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useToast } from "@/components/toast";

const statusBadge: Record<string, { className: string; label: string }> = {
  open: { className: "badge-green", label: "Open" },
  closed: { className: "badge-yellow", label: "Closed" },
  cancelled: { className: "badge-red", label: "Cancelled" },
};

const statusAccent: Record<string, string> = {
  open: "card-accent-green",
  closed: "card-accent-gray",
  cancelled: "card-accent-red",
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
  isLoggedIn: boolean;
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

function ContactAdminForm({
  sheetId,
  onClose,
}: {
  sheetId: string;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  async function handleSend(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!message.trim()) return;
    setSending(true);
    try {
      const res = await fetch(`/api/sheets/${sheetId}/contact-admins`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: message.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast(data.error || "Failed to send message.", "error");
      } else {
        toast("Message sent to group admins.", "success");
        onClose();
      }
    } catch {
      toast("Failed to send message.", "error");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-2" onClick={(e) => e.preventDefault()}>
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Write a message to the group admins..."
        className="input text-sm w-full h-20 resize-none"
        maxLength={500}
      />
      <div className="flex items-center gap-2">
        <button
          onClick={handleSend}
          disabled={sending || !message.trim()}
          className="btn-primary btn-sm"
        >
          {sending ? "Sending..." : "Send"}
        </button>
        <button
          onClick={(e) => { e.preventDefault(); onClose(); }}
          className="text-xs text-surface-muted hover:text-dark-100"
        >
          Cancel
        </button>
      </div>
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
  isLoggedIn,
}: SheetCardProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showContactForm, setShowContactForm] = useState(false);
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
        toast(data.error || "Failed to sign up.", "error");
      }
      router.refresh();
    } catch {
      toast("Failed to sign up.", "error");
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
        toast(data.error || "Failed to withdraw.", "error");
      }
      router.refresh();
    } catch {
      toast("Failed to withdraw.", "error");
    } finally {
      setLoading(false);
    }
  }

  const accent = statusAccent[status] ?? "card-accent-gray";

  return (
    <div className={`card hover:ring-brand-500/30 transition-shadow ${accent}`}>
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
            {/* Capacity bar */}
            <div className="mt-1.5 h-1.5 w-20 rounded-full bg-surface-overlay overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${confirmedCount >= playerLimit ? "bg-accent-400" : "bg-teal-400"}`}
                style={{ width: `${Math.min((confirmedCount / playerLimit) * 100, 100)}%` }}
              />
            </div>
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

      {/* Row 2: Actions (sign up / withdraw / contact admins) */}
      {(isRegistered || (isOpen && !signupClosed)) && (
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
                  className="btn-danger btn-sm"
                >
                  {loading ? "..." : "Withdraw"}
                </button>
              )}
            </>
          ) : (
            <button
              onClick={handleSignUp}
              disabled={loading}
              className="btn-primary btn-sm"
            >
              {loading ? "..." : isFull ? "Join Waitlist" : "Sign Up"}
            </button>
          )}
        </div>
      )}

      {/* Contact group admins when signup/withdraw is closed */}
      {isLoggedIn && signupClosed && !isRegistered && status !== "cancelled" && (
        <div className="mt-2">
          {!showContactForm ? (
            <button
              onClick={(e) => { e.preventDefault(); setShowContactForm(true); }}
              className="text-xs text-brand-400 hover:text-brand-300 font-medium"
            >
              Message Group Admins
            </button>
          ) : (
            <ContactAdminForm
              sheetId={sheetId}
              onClose={() => setShowContactForm(false)}
            />
          )}
        </div>
      )}

      {/* Contact group admins for registered users when withdraw is closed */}
      {isLoggedIn && isRegistered && withdrawClosed && status !== "cancelled" && (
        <div className="mt-2">
          {!showContactForm ? (
            <button
              onClick={(e) => { e.preventDefault(); setShowContactForm(true); }}
              className="text-xs text-brand-400 hover:text-brand-300 font-medium"
            >
              Message Group Admins
            </button>
          ) : (
            <ContactAdminForm
              sheetId={sheetId}
              onClose={() => setShowContactForm(false)}
            />
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
              <div className="space-y-0.5">
                {confirmedPlayers.map((p, i) => (
                  <div key={i} className="flex items-center gap-2 min-h-[2.75rem]">
                    <span className="text-xs text-surface-muted w-5 text-right shrink-0">
                      {i + 1}.
                    </span>
                    <PlayerAvatar name={p.name} avatarUrl={p.avatarUrl} />
                    <span className="text-sm text-dark-100 truncate">{p.name}</span>
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
              <div className="space-y-0.5">
                {waitlistedPlayers.map((p, i) => (
                  <div key={i} className="flex items-center gap-2 min-h-[2.75rem]">
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
