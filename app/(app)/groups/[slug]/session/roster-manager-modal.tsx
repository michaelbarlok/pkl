"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

interface Member {
  id: string;
  display_name: string;
}

interface Props {
  groupId: string;
  sessionId: string;
  members: Member[];
  checkedInIds: string[];
  onClose: () => void;
  onChanged: () => void;
}

/**
 * Admin-only modal for adding and removing players from an active
 * free-play session. Changes take effect from the NEXT round —
 * the current round's match assignments are untouched so in-flight
 * games aren't orphaned. Renders via createPortal so nested
 * stacking contexts (the bottom mobile nav, etc.) don't clip it.
 */
export function RosterManagerModal({
  groupId,
  sessionId,
  members,
  checkedInIds,
  onClose,
  onChanged,
}: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    const prevOverflow = document.body.style.overflow;
    const prevPadding = document.body.style.paddingRight;
    document.body.style.overflow = "hidden";
    if (scrollbar > 0) document.body.style.paddingRight = `${scrollbar}px`;
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.paddingRight = prevPadding;
    };
  }, []);

  const checkedInSet = new Set(checkedInIds);
  const filtered = members
    .filter((m) =>
      filter.trim() === ""
        ? true
        : m.display_name.toLowerCase().includes(filter.trim().toLowerCase())
    )
    // Checked-in players float to the top so admins can see who's
    // already in the session at a glance.
    .sort((a, b) => {
      const aIn = checkedInSet.has(a.id) ? 0 : 1;
      const bIn = checkedInSet.has(b.id) ? 0 : 1;
      if (aIn !== bIn) return aIn - bIn;
      return a.display_name.localeCompare(b.display_name);
    });

  async function add(playerId: string) {
    setBusy(playerId);
    setError("");
    const res = await fetch(
      `/api/groups/${groupId}/sessions/${sessionId}/players`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ player_id: playerId }),
      }
    );
    setBusy(null);
    if (res.ok) {
      onChanged();
      return;
    }
    const data = await res.json().catch(() => ({}));
    setError(data.error ?? "Couldn't add player");
  }

  async function remove(playerId: string) {
    setBusy(playerId);
    setError("");
    const res = await fetch(
      `/api/groups/${groupId}/sessions/${sessionId}/players?player_id=${encodeURIComponent(playerId)}`,
      { method: "DELETE" }
    );
    setBusy(null);
    if (res.ok) {
      onChanged();
      return;
    }
    const data = await res.json().catch(() => ({}));
    setError(data.error ?? "Couldn't remove player");
  }

  const modal = (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="roster-manager-title"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md rounded-2xl bg-surface-raised shadow-2xl ring-1 ring-surface-border animate-scale-in p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="roster-manager-title" className="text-base font-semibold text-dark-100">
              Manage roster
            </h2>
            <p className="text-xs text-surface-muted mt-0.5">
              Add a late arriver or drop someone who had to leave. Changes apply to the next round — the current round stays put.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-surface-muted hover:text-dark-100"
            aria-label="Close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Search members"
          className="input w-full text-sm"
        />

        <ul className="max-h-[50vh] overflow-y-auto space-y-1 -mx-1">
          {filtered.length === 0 ? (
            <li className="text-xs text-surface-muted text-center py-6">
              No matches.
            </li>
          ) : (
            filtered.map((m) => {
              const isIn = checkedInSet.has(m.id);
              const thisBusy = busy === m.id;
              return (
                <li
                  key={m.id}
                  className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-surface-overlay"
                >
                  <span className="text-sm text-dark-100 truncate">
                    {m.display_name}
                  </span>
                  {isIn ? (
                    <button
                      type="button"
                      onClick={() => remove(m.id)}
                      disabled={thisBusy}
                      className="btn-secondary text-xs py-1 px-2.5 disabled:opacity-50"
                    >
                      {thisBusy ? "…" : "Remove"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => add(m.id)}
                      disabled={thisBusy}
                      className="btn-primary text-xs py-1 px-2.5 disabled:opacity-50"
                    >
                      {thisBusy ? "…" : "Add"}
                    </button>
                  )}
                </li>
              );
            })
          )}
        </ul>

        {error && <p className="text-xs text-red-400">{error}</p>}

        <p className="text-[11px] text-surface-muted">
          {checkedInSet.size} checked in · tap a name to add them or remove them from the upcoming round.
        </p>
      </div>
    </div>
  );

  return mounted ? createPortal(modal, document.body) : null;
}
