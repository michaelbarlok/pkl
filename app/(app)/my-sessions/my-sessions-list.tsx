"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { formatDate } from "@/lib/utils";

export interface SessionHistoryItem {
  kind: "ladder" | "free_play";
  id: string;
  href: string;
  groupId: string;
  groupName: string;
  groupSlug: string | null;
  groupType: string;
  eventDate: string | null;
  createdAt: string;
  wins: number;
  losses: number;
  pointDiff: number;
  poolFinish: number | null;
  stepBefore: number | null;
  stepAfter: number | null;
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

export function MySessionsList({ items }: { items: SessionHistoryItem[] }) {
  const [groupFilter, setGroupFilter] = useState<string>("all");

  // Distinct groups found in the history, sorted by name for the dropdown.
  const groupOptions = useMemo(() => {
    const byId = new Map<string, string>();
    for (const i of items) {
      if (!byId.has(i.groupId)) byId.set(i.groupId, i.groupName);
    }
    return Array.from(byId.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [items]);

  const filtered = useMemo(() => {
    if (groupFilter === "all") return items;
    return items.filter((i) => i.groupId === groupFilter);
  }, [items, groupFilter]);

  if (items.length === 0) {
    return (
      <EmptyState
        title="No sessions yet"
        description="Once you play in a group session, it'll show up here with your result."
      />
    );
  }

  return (
    <div className="space-y-3">
      {/* Group filter — only shown when the viewer has played in 2+
          groups, otherwise there's nothing to filter between. */}
      {groupOptions.length > 1 && (
        <div className="flex items-center gap-2 text-sm">
          <label htmlFor="group-filter" className="text-surface-muted">
            Group
          </label>
          <select
            id="group-filter"
            value={groupFilter}
            onChange={(e) => setGroupFilter(e.target.value)}
            className="input py-1 text-sm"
          >
            <option value="all">All groups</option>
            {groupOptions.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
          <span className="text-xs text-surface-muted ml-auto">
            {filtered.length} session{filtered.length === 1 ? "" : "s"}
          </span>
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState
          title="No sessions in this group yet"
          description="Switch to another group or check back after your next session."
        />
      ) : (
        <ul className="divide-y divide-surface-border rounded-xl ring-1 ring-surface-border bg-surface-raised overflow-hidden">
          {filtered.map((s) => (
            <li key={`${s.kind}-${s.id}`}>
              <Link
                href={s.href}
                className="flex items-center gap-3 px-4 py-3 hover:bg-surface-overlay/50 transition-colors active:bg-surface-overlay"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-dark-100 truncate">
                      {s.eventDate ? formatDate(s.eventDate) : formatDate(s.createdAt)}
                    </p>
                    <span
                      className={
                        s.kind === "free_play"
                          ? "badge-yellow shrink-0"
                          : "badge-blue shrink-0"
                      }
                    >
                      {s.kind === "free_play" ? "Free Play" : "Ladder"}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-surface-muted truncate">
                    <span className="font-medium text-dark-200">{s.groupName}</span>
                    <ResultSummary item={s} />
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
      )}
    </div>
  );
}

/** Per-kind result line. Ladder sessions also show pool finish +
 *  step change when those are available so progress is easy to trace. */
function ResultSummary({ item }: { item: SessionHistoryItem }) {
  const hasScores = item.wins > 0 || item.losses > 0;
  const record = hasScores ? `${item.wins}-${item.losses}` : null;

  const parts: string[] = [];
  if (record) parts.push(record);

  if (item.kind === "ladder") {
    if (item.poolFinish != null) parts.push(`${ordinal(item.poolFinish)} on court`);
    if (
      item.stepBefore != null &&
      item.stepAfter != null &&
      item.stepBefore !== item.stepAfter
    ) {
      parts.push(`Step ${item.stepBefore} → ${item.stepAfter}`);
    } else if (item.stepAfter != null) {
      parts.push(`Step ${item.stepAfter}`);
    }
  }

  if (parts.length === 0) return null;

  return (
    <>
      <span className="mx-1.5">·</span>
      {parts.map((p, i) => (
        <span key={i}>
          {i > 0 && <span className="mx-1.5">·</span>}
          {p}
        </span>
      ))}
    </>
  );
}
