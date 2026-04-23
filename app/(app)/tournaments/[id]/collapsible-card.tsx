"use client";

import { useState } from "react";

interface Props {
  title: string;
  defaultOpen?: boolean;
  subtitle?: string;
  children: React.ReactNode;
}

/**
 * Collapsible card used for the tournament details panel. Defaults
 * to open before the tournament goes live so the info is visible at
 * first glance; folds closed once status=in_progress so the
 * Organizer Controls + Court Tracker own the viewport during play.
 * The user can still expand it any time.
 */
export function CollapsibleCard({
  title,
  defaultOpen = true,
  subtitle,
  children,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-left"
        aria-expanded={open}
      >
        <div>
          <p className="text-sm font-semibold text-dark-100">{title}</p>
          {subtitle && (
            <p className="text-xs text-surface-muted mt-0.5">{subtitle}</p>
          )}
        </div>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          className={`h-4 w-4 text-surface-muted transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </button>
      {open && <div className="mt-4 space-y-4">{children}</div>}
    </div>
  );
}
