"use client";

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

  return (
    <DataTable
      data={sessions}
      columns={columns}
      keyFn={(s) => s.id}
      rowHref={(s) => `/admin/sessions/${s.id}`}
      mobileMode="cards"
      caption="Shootout sessions across all groups"
      empty={{
        title: "No sessions yet",
        description: "Start a shootout from a sign-up sheet to see it here.",
      }}
    />
  );
}
