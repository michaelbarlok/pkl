"use client";

import Link from "next/link";
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

export function SessionsTable({ sessions }: { sessions: SessionRow[] }) {
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

      {/* Mobile: compact two-line list, tappable row.
          Line 1: date (prominent) + status pill (right-aligned).
          Line 2: group name + courts/round meta (muted, truncating). */}
      <ul className="sm:hidden divide-y divide-surface-border rounded-xl ring-1 ring-surface-border bg-surface-raised overflow-hidden">
        {sessions.map((s) => (
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
    </>
  );
}
