"use client";

import Link from "next/link";
import { DataTable, type Column } from "@/components/data-table";
import { EmptyIllustrationCalendar } from "@/components/empty-state";
import { DeleteSheetButton } from "./delete-sheet-button";
import { formatDate } from "@/lib/utils";

const statusClass: Record<string, string> = {
  open: "status-open",
  closed: "status-closed",
  cancelled: "status-cancelled",
};

const statusLabel: Record<string, string> = {
  open: "Open",
  closed: "Closed",
  cancelled: "Cancelled",
};

export type SheetRow = {
  id: string;
  event_date: string;
  player_limit: number;
  status: string;
  group: { id: string; name: string } | null;
  confirmed: number;
  waitlisted: number;
};

export function SheetsTable({
  sheets,
  kind,
}: {
  sheets: SheetRow[];
  kind: "active" | "cancelled";
}) {
  const columns: Column<SheetRow>[] = [
    {
      key: "date",
      header: "Date",
      cell: (s) => (
        <Link href={`/admin/sheets/${s.id}`} className="font-medium text-dark-100 hover:text-brand-300">
          {formatDate(s.event_date)}
        </Link>
      ),
      sortValue: (s) => s.event_date,
      sortable: true,
      priority: "primary",
    },
    {
      key: "status",
      header: "Status",
      cell: (s) => (
        <span className={statusClass[s.status] ?? "status-closed"}>
          {statusLabel[s.status] ?? s.status}
        </span>
      ),
      priority: "primary",
    },
    {
      key: "group",
      header: "Group",
      cell: (s) => s.group?.name ?? "—",
      sortValue: (s) => s.group?.name?.toLowerCase() ?? "",
      sortable: true,
      priority: "secondary",
    },
    {
      key: "registered",
      header: "Reg / Limit",
      cell: (s) => `${s.confirmed}/${s.player_limit}`,
      sortValue: (s) => s.confirmed,
      sortable: true,
      align: "right",
      priority: "primary",
    },
    {
      key: "waitlisted",
      header: "Waitlisted",
      cell: (s) => s.waitlisted,
      align: "right",
      priority: "secondary",
    },
    {
      key: "actions",
      header: "",
      cell: (s) => (
        <div className="flex items-center justify-end gap-3 text-sm">
          <Link href={`/sheets/${s.id}`} className="text-brand-400 hover:text-brand-300">
            View
          </Link>
          {s.status !== "cancelled" && (
            <Link
              href={`/admin/sheets/${s.id}?action=cancel`}
              className="text-adaptive-red hover:text-red-500"
            >
              Cancel
            </Link>
          )}
          <DeleteSheetButton sheetId={s.id} />
        </div>
      ),
      align: "right",
      priority: "primary",
    },
  ];

  return (
    <DataTable
      data={sheets}
      columns={columns}
      keyFn={(s) => s.id}
      caption={kind === "active" ? "Active sign-up sheets" : "Cancelled sign-up sheets"}
      getRowClassName={(s) => (s.status === "cancelled" ? "bg-red-500/5" : "")}
      empty={
        kind === "active"
          ? {
              title: "No sign-up sheets created yet",
              description: "Create a sheet to start managing event sign-ups.",
              illustration: <EmptyIllustrationCalendar />,
              actionLabel: "Create sheet",
              actionHref: "/admin/sheets/new",
            }
          : undefined
      }
    />
  );
}
