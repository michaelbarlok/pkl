"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { DataTable, type Column } from "@/components/data-table";
import { EmptyIllustrationCalendar } from "@/components/empty-state";
import { DeleteSheetButton } from "./delete-sheet-button";
import { sheetSignupClosed } from "@/lib/sheet-lifecycle";
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
  event_time: string | null;
  player_limit: number;
  status: string;
  group: { id: string; name: string } | null;
  confirmed: number;
  waitlisted: number;
};

/**
 * Raw `status` stays "open" forever unless an admin explicitly closes
 * or cancels — nothing flips it at event time. For display we compute
 * an effective status: once the event has started (via the shared
 * sheetSignupClosed helper), render "Closed" even when the column
 * still says "open". Cancelled stays cancelled.
 */
function effectiveStatus(s: SheetRow): string {
  if (s.status !== "open") return s.status;
  if (sheetSignupClosed(s)) return "closed";
  return "open";
}

type SortKey = "date" | "group";
type SortDir = "asc" | "desc";

export function SheetsTable({
  sheets,
  kind,
}: {
  sheets: SheetRow[];
  kind: "active" | "cancelled";
}) {
  // Mobile-only sort. Default date-desc matches how the server orders
  // the list. Desktop keeps the DataTable's clickable column headers.
  const [mobileSortKey, setMobileSortKey] = useState<SortKey>("date");
  const [mobileSortDir, setMobileSortDir] = useState<SortDir>("desc");

  function toggleSort(key: SortKey) {
    if (mobileSortKey !== key) {
      setMobileSortKey(key);
      setMobileSortDir(key === "date" ? "desc" : "asc");
    } else {
      setMobileSortDir((d) => (d === "asc" ? "desc" : "asc"));
    }
  }

  const sortedForMobile = useMemo(() => {
    const copy = [...sheets];
    copy.sort((a, b) => {
      let av: string;
      let bv: string;
      if (mobileSortKey === "date") {
        av = a.event_date ?? "";
        bv = b.event_date ?? "";
      } else {
        av = a.group?.name?.toLowerCase() ?? "";
        bv = b.group?.name?.toLowerCase() ?? "";
      }
      const cmp = av.localeCompare(bv);
      return mobileSortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [sheets, mobileSortKey, mobileSortDir]);

  const columns: Column<SheetRow>[] = [
    {
      key: "date",
      header: "Date",
      cell: (s) => (
        <Link href={`/admin/sheets/${s.id}`} className="font-medium text-dark-100 hover:text-brand-vivid">
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
      cell: (s) => {
        const es = effectiveStatus(s);
        return (
          <span className={statusClass[es] ?? "status-closed"}>
            {statusLabel[es] ?? es}
          </span>
        );
      },
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
          <Link href={`/sheets/${s.id}`} className="text-brand-vivid hover:opacity-80">
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

  if (sheets.length === 0) {
    return (
      <DataTable
        data={sheets}
        columns={columns}
        keyFn={(s) => s.id}
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

  return (
    <>
      {/* Desktop: sortable DataTable with priority-based column hiding.
          Mobile gets the compact list below; the old "cards" mode
          printed five label/value rows per sheet which was unreadable. */}
      <div className="hidden sm:block">
        <DataTable
          data={sheets}
          columns={columns}
          keyFn={(s) => s.id}
          mobileMode="auto-hide"
          caption={kind === "active" ? "Active sign-up sheets" : "Cancelled sign-up sheets"}
          getRowClassName={(s) => (s.status === "cancelled" ? "bg-red-500/5" : "")}
        />
      </div>

      {/* Mobile: compact sortable list matching Admin > Sessions. Tap
          a row → sheet detail page, where cancel/delete live. */}
      <div className="sm:hidden space-y-2">
        <div className="flex flex-wrap items-center gap-2 text-xs">
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
          {sortedForMobile.map((s) => {
            const es = effectiveStatus(s);
            return (
              <li
                key={s.id}
                className={`flex items-stretch ${
                  s.status === "cancelled" ? "bg-red-500/5" : ""
                }`}
              >
                {/* Main row → sheet detail. Delete sits outside the
                    Link so tapping it doesn't also navigate. */}
                <Link
                  href={`/admin/sheets/${s.id}`}
                  className="flex items-center gap-3 flex-1 min-w-0 px-4 py-3 hover:bg-surface-overlay/50 transition-colors active:bg-surface-overlay"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-dark-100 truncate">
                        {formatDate(s.event_date)}
                      </p>
                      <span className={`${statusClass[es] ?? "status-closed"} shrink-0`}>
                        {statusLabel[es] ?? es}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-surface-muted truncate">
                      <span className="font-medium text-dark-200">{s.group?.name ?? "—"}</span>
                      <span className="mx-1.5">·</span>
                      {s.confirmed}/{s.player_limit} signed up
                      {s.waitlisted > 0 && (
                        <>
                          <span className="mx-1.5">·</span>
                          {s.waitlisted} waitlisted
                        </>
                      )}
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
                <div className="flex items-center border-l border-surface-border px-3">
                  <DeleteSheetButton sheetId={s.id} />
                </div>
              </li>
            );
          })}
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
        <svg viewBox="0 0 12 12" className="h-3 w-3 text-brand-vivid" aria-hidden>
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
