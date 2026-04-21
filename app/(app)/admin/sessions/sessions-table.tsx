"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { DataTable, type Column } from "@/components/data-table";
import { formatDate } from "@/lib/utils";
import { SESSION_STATUS_COLORS, SESSION_STATUS_LABELS } from "@/lib/status-colors";

export type SessionRow = {
  id: string;
  status: string;
  num_courts: number;
  current_round: number;
  created_at: string;
  sheet: { event_date?: string | null } | null;
  group: { name?: string | null } | null;
};

type SortKey = "date" | "group";
type SortDir = "asc" | "desc";

export function SessionsTable({ sessions }: { sessions: SessionRow[] }) {
  // Mobile-only sort. Desktop keeps the DataTable's clickable headers,
  // which cover the same two columns plus courts/round. Default is
  // "date desc" so the most recent session lands at the top — matches
  // how the server orders the list (created_at desc) before we receive it.
  const [mobileSortKey, setMobileSortKey] = useState<SortKey>("date");
  const [mobileSortDir, setMobileSortDir] = useState<SortDir>("desc");

  function toggleSort(key: SortKey) {
    if (mobileSortKey !== key) {
      setMobileSortKey(key);
      // Sensible default per column: newest first for date, A→Z for group.
      setMobileSortDir(key === "date" ? "desc" : "asc");
    } else {
      setMobileSortDir((d) => (d === "asc" ? "desc" : "asc"));
    }
  }

  const sortedForMobile = useMemo(() => {
    const copy = [...sessions];
    copy.sort((a, b) => {
      let av: string;
      let bv: string;
      if (mobileSortKey === "date") {
        av = a.sheet?.event_date ?? "";
        bv = b.sheet?.event_date ?? "";
      } else {
        av = a.group?.name?.toLowerCase() ?? "";
        bv = b.group?.name?.toLowerCase() ?? "";
      }
      const cmp = av.localeCompare(bv);
      return mobileSortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [sessions, mobileSortKey, mobileSortDir]);

  const columns: Column<SessionRow>[] = [
    {
      key: "date",
      header: "Date",
      cell: (s) => (s.sheet?.event_date ? formatDate(s.sheet.event_date) : "—"),
      sortValue: (s) => s.sheet?.event_date ?? "",
      sortable: true,
      priority: "primary",
    },
    {
      key: "group",
      header: "Group",
      cell: (s) => s.group?.name ?? "—",
      sortValue: (s) => s.group?.name?.toLowerCase() ?? "",
      sortable: true,
      priority: "primary",
    },
    {
      key: "status",
      header: "Status",
      cell: (s) => (
        <span className={SESSION_STATUS_COLORS[s.status] ?? "status-closed"}>
          {SESSION_STATUS_LABELS[s.status] ?? s.status}
        </span>
      ),
      priority: "primary",
    },
    {
      key: "courts",
      header: "Courts",
      cell: (s) => s.num_courts,
      align: "right",
      priority: "secondary",
    },
    {
      key: "round",
      header: "Round",
      cell: (s) => s.current_round,
      align: "right",
      priority: "secondary",
    },
  ];

  if (sessions.length === 0) {
    return (
      <DataTable
        data={sessions}
        columns={columns}
        keyFn={(s) => s.id}
        empty={{
          title: "No sessions yet",
          description: "Start a shootout from a sign-up sheet to see it here.",
        }}
      />
    );
  }

  return (
    <>
      {/* Desktop: the shared DataTable (sortable, auto-hide on sm).
          On mobile we render a dense custom list instead because five
          label/value rows per session filled the viewport with three
          sessions visible at most. */}
      <div className="hidden sm:block">
        <DataTable
          data={sessions}
          columns={columns}
          keyFn={(s) => s.id}
          rowHref={(s) => `/admin/sessions/${s.id}`}
          mobileMode="auto-hide"
          caption="Shootout sessions across all groups"
        />
      </div>

      {/* Mobile: compact two-line list with a sort toggle bar above.
          Desktop keeps the DataTable's clickable headers (which cover
          the same two keys plus courts/round), so the sort controls
          here duplicate intent, not code. */}
      <div className="sm:hidden space-y-2">
        <div className="flex items-center gap-2 text-xs">
          <span className="text-surface-muted font-medium uppercase tracking-wide">
            Sort
          </span>
          <SortChip
            label="Date"
            active={mobileSortKey === "date"}
            direction={mobileSortDir}
            onClick={() => toggleSort("date")}
          />
          <SortChip
            label="Group"
            active={mobileSortKey === "group"}
            direction={mobileSortDir}
            onClick={() => toggleSort("group")}
          />
        </div>

        <ul className="divide-y divide-surface-border rounded-xl ring-1 ring-surface-border bg-surface-raised overflow-hidden">
          {sortedForMobile.map((s) => (
            <li key={s.id}>
              <Link
                href={`/admin/sessions/${s.id}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-surface-overlay/50 transition-colors active:bg-surface-overlay"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-dark-100 truncate">
                      {s.sheet?.event_date ? formatDate(s.sheet.event_date) : "—"}
                    </p>
                    <span className={SESSION_STATUS_COLORS[s.status] ?? "status-closed"}>
                      {SESSION_STATUS_LABELS[s.status] ?? s.status}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-surface-muted truncate">
                    <span className="font-medium text-dark-200">{s.group?.name ?? "—"}</span>
                    <span className="mx-1.5">·</span>
                    {s.num_courts} courts
                    <span className="mx-1.5">·</span>
                    Round {s.current_round}
                  </p>
                </div>
                <svg
                  className="h-4 w-4 shrink-0 text-surface-muted"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                  aria-hidden
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="m9 18 6-6-6-6" />
                </svg>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

function SortChip({
  label,
  active,
  direction,
  onClick,
}: {
  label: string;
  active: boolean;
  direction: SortDir;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-medium transition-colors " +
        (active
          ? "bg-surface-overlay text-dark-100 ring-1 ring-brand-vivid/50"
          : "bg-surface-overlay text-surface-muted hover:text-dark-200")
      }
    >
      {label}
      {active && (
        <svg
          viewBox="0 0 12 12"
          className="h-3 w-3 text-brand-vivid"
          aria-hidden
        >
          {direction === "desc" ? (
            <path d="M3 4.5 L6 8 L9 4.5 Z" fill="currentColor" />
          ) : (
            <path d="M3 7.5 L6 4 L9 7.5 Z" fill="currentColor" />
          )}
        </svg>
      )}
    </button>
  );
}
