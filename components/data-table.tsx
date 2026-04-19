"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/empty-state";
import { SkeletonTable } from "@/components/skeletons";

/**
 * Declarative, themed table primitive.
 *
 * Scope: simple list/directory tables (admin groups, sheets, sessions,
 * tournaments, ratings). Supports:
 *   - Priority-based responsive column hiding OR card stack on mobile
 *   - Optional client-side sorting via clickable headers
 *   - Row click navigation (href or callback)
 *   - Loading + empty slots
 *   - Per-row className (for status-tinted rows, e.g. cancelled sheets)
 *
 * Explicitly NOT scoped: bulk selection, inline editing, server-side
 * pagination. Tables that need those stay bespoke.
 */

type ColumnAlign = "left" | "center" | "right";

/** Priority determines visibility at narrow viewports. primary is always
 *  shown; secondary hides below `sm`; tertiary hides below `md`. */
export type ColumnPriority = "primary" | "secondary" | "tertiary";

export interface Column<T> {
  /** Stable identifier. Also used as the sort key unless `sortValue` is given. */
  key: string;
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  /** Extra classes applied to both <th> and <td> — e.g. `w-32 text-right`. */
  className?: string;
  align?: ColumnAlign;
  /** Enables a clickable header that toggles asc → desc → off. */
  sortable?: boolean;
  /** How to extract a comparable value for sorting. Default: the raw `cell`
   *  output cast to string. Usually pass a function that returns a number
   *  or a lowercased string. */
  sortValue?: (row: T) => string | number | null | undefined;
  /** Visibility tier (see ColumnPriority). Default: "primary". */
  priority?: ColumnPriority;
  /** Label used in mobileMode="cards". Falls back to `header` if string. */
  mobileLabel?: string;
}

export interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  /** React list key. Required — no row index fallback, on purpose. */
  keyFn: (row: T) => string;
  /** Render skeletons instead of rows while true. */
  loading?: boolean;
  /** Rendered when `data.length === 0` and not loading. */
  empty?: {
    title: string;
    description?: string;
    illustration?: React.ReactNode;
    actionLabel?: string;
    actionHref?: string;
  };
  /** Initial sort state. If unset, table renders in the order `data` arrives. */
  defaultSort?: { key: string; direction: "asc" | "desc" };
  /** If provided, each row becomes a navigable link. Prefer over onRowClick. */
  rowHref?: (row: T) => string;
  /** Click-only handler. Ignored if rowHref is also provided. */
  onRowClick?: (row: T) => void;
  /** Per-row className for status tinting etc. */
  getRowClassName?: (row: T) => string | undefined;
  /** Mobile layout mode:
   *  - "auto-hide" (default): hide secondary/tertiary columns at narrow widths.
   *  - "cards": stack each row as a label/value card on <sm. */
  mobileMode?: "auto-hide" | "cards";
  /** Visually hidden accessible caption. */
  caption?: string;
  /** Extra wrapper className. */
  className?: string;
  /** Skeleton row count while loading. Default 5. */
  loadingRows?: number;
}

// ────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────

export function DataTable<T>({
  data,
  columns,
  keyFn,
  loading = false,
  empty,
  defaultSort,
  rowHref,
  onRowClick,
  getRowClassName,
  mobileMode = "auto-hide",
  caption,
  className,
  loadingRows = 5,
}: DataTableProps<T>) {
  const [sort, setSort] = useState<{ key: string; direction: "asc" | "desc" } | null>(
    defaultSort ?? null
  );

  const sorted = useMemo(() => {
    if (!sort) return data;
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return data;
    const getValue = col.sortValue ?? ((row: T) => (col.cell(row) as unknown as string));
    const copy = [...data];
    copy.sort((a, b) => {
      const av = getValue(a);
      const bv = getValue(b);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") {
        return sort.direction === "asc" ? av - bv : bv - av;
      }
      const as = String(av).toLowerCase();
      const bs = String(bv).toLowerCase();
      return sort.direction === "asc" ? as.localeCompare(bs) : bs.localeCompare(as);
    });
    return copy;
  }, [data, columns, sort]);

  function toggleSort(key: string) {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, direction: "asc" };
      if (prev.direction === "asc") return { key, direction: "desc" };
      return null; // third click clears sort
    });
  }

  // Loading short-circuits to the skeleton table regardless of mode.
  if (loading) {
    return (
      <div className={className}>
        <SkeletonTable rows={loadingRows} />
      </div>
    );
  }

  if (sorted.length === 0 && empty) {
    return (
      <div className={className}>
        <EmptyState
          title={empty.title}
          description={empty.description}
          illustration={empty.illustration}
          actionLabel={empty.actionLabel}
          actionHref={empty.actionHref}
        />
      </div>
    );
  }

  // Mobile card mode renders a stacked card per row; desktop falls through
  // to the normal table. The distinction is purely CSS (sm: breakpoint).
  return (
    <div className={cn("overflow-hidden rounded-xl ring-1 ring-surface-border bg-surface-raised", className)}>
      {/* Desktop / tablet table */}
      <div className={cn(mobileMode === "cards" ? "hidden sm:block" : "block", "overflow-x-auto")}>
        <table className="min-w-full text-sm">
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead>
            <tr>
              {columns.map((col) => (
                <HeaderCell
                  key={col.key}
                  col={col}
                  sort={sort}
                  onToggle={toggleSort}
                  mobileMode={mobileMode}
                />
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => {
              const key = keyFn(row);
              const href = rowHref?.(row);
              const rowClass = cn(
                "border-t border-surface-border transition-colors",
                (href || onRowClick) && "cursor-pointer hover:bg-surface-overlay/50",
                getRowClassName?.(row)
              );
              return (
                <tr
                  key={key}
                  className={rowClass}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                >
                  {columns.map((col) => (
                    <BodyCell key={col.key} col={col} row={row} href={href} mobileMode={mobileMode} />
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile card stack — only rendered when mobileMode === "cards" */}
      {mobileMode === "cards" && (
        <div className="divide-y divide-surface-border sm:hidden">
          {sorted.map((row) => {
            const key = keyFn(row);
            const href = rowHref?.(row);
            const rowClass = cn(
              "p-4 space-y-2",
              (href || onRowClick) && "cursor-pointer hover:bg-surface-overlay/50 transition-colors",
              getRowClassName?.(row)
            );
            const content = (
              <>
                {columns.map((col) => {
                  const label = col.mobileLabel ?? (typeof col.header === "string" ? col.header : col.key);
                  return (
                    <div key={col.key} className="flex items-start justify-between gap-3">
                      <span className="text-xs font-medium uppercase tracking-wide text-surface-muted shrink-0">
                        {label}
                      </span>
                      <div className={cn("min-w-0 text-right text-dark-100")}>{col.cell(row)}</div>
                    </div>
                  );
                })}
              </>
            );
            return href ? (
              <Link key={key} href={href} className={rowClass}>
                {content}
              </Link>
            ) : (
              <div
                key={key}
                className={rowClass}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {content}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Cells
// ────────────────────────────────────────────────────────────

const PRIORITY_CLASS: Record<ColumnPriority, string> = {
  primary: "",
  secondary: "hidden sm:table-cell",
  tertiary: "hidden md:table-cell",
};

const ALIGN_CLASS: Record<ColumnAlign, string> = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
};

function HeaderCell<T>({
  col,
  sort,
  onToggle,
  mobileMode,
}: {
  col: Column<T>;
  sort: { key: string; direction: "asc" | "desc" } | null;
  onToggle: (key: string) => void;
  mobileMode: "auto-hide" | "cards";
}) {
  const priorityClass =
    mobileMode === "cards" ? "" : PRIORITY_CLASS[col.priority ?? "primary"];
  const alignClass = ALIGN_CLASS[col.align ?? "left"];
  const isSorted = sort?.key === col.key;
  const ariaSort: "ascending" | "descending" | "none" | undefined = col.sortable
    ? isSorted
      ? sort!.direction === "asc"
        ? "ascending"
        : "descending"
      : "none"
    : undefined;

  const baseClasses = cn(
    "px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-surface-muted",
    priorityClass,
    alignClass,
    col.className
  );

  if (!col.sortable) {
    return (
      <th scope="col" className={baseClasses}>
        {col.header}
      </th>
    );
  }

  return (
    <th scope="col" className={baseClasses} aria-sort={ariaSort}>
      <button
        type="button"
        onClick={() => onToggle(col.key)}
        className="inline-flex items-center gap-1 font-semibold uppercase tracking-wide hover:text-dark-100 transition-colors"
      >
        {col.header}
        <SortIndicator state={isSorted ? sort!.direction : "none"} />
      </button>
    </th>
  );
}

function BodyCell<T>({
  col,
  row,
  href,
  mobileMode,
}: {
  col: Column<T>;
  row: T;
  href: string | undefined;
  mobileMode: "auto-hide" | "cards";
}) {
  const priorityClass =
    mobileMode === "cards" ? "" : PRIORITY_CLASS[col.priority ?? "primary"];
  const alignClass = ALIGN_CLASS[col.align ?? "left"];
  const classes = cn("px-3 py-2.5 align-middle text-dark-100", priorityClass, alignClass, col.className);
  const content = col.cell(row);

  // When rowHref is set, wrap the cell contents in a <Link> so the whole row
  // is clickable without using JS navigation. We wrap PER CELL (not the row)
  // because <tr><a> isn't valid HTML — each cell gets its own Link that fills
  // the cell, which is the standard approach for clickable table rows.
  return (
    <td className={classes}>
      {href ? (
        <Link href={href} className="block -m-3 px-3 py-2.5 focus-visible:outline-none">
          {content}
        </Link>
      ) : (
        content
      )}
    </td>
  );
}

function SortIndicator({ state }: { state: "asc" | "desc" | "none" }) {
  return (
    <svg
      viewBox="0 0 12 12"
      aria-hidden
      className={cn(
        "h-3 w-3 transition-opacity",
        state === "none" ? "opacity-30" : "opacity-100 text-brand-vivid"
      )}
    >
      {state === "desc" ? (
        <path d="M3 4.5 L6 8 L9 4.5 Z" fill="currentColor" />
      ) : (
        <path d="M3 7.5 L6 4 L9 7.5 Z" fill="currentColor" />
      )}
    </svg>
  );
}
