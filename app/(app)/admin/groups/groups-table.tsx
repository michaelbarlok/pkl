"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { DataTable, type Column } from "@/components/data-table";
import { ConfirmFormButton } from "@/components/confirm-form-button";
import { EmptyIllustrationGroups } from "@/components/empty-state";
import { formatDate } from "@/lib/utils";

export type GroupRow = {
  id: string;
  name: string;
  slug: string;
  group_type: string;
  visibility: string;
  is_active: boolean;
  city: string | null;
  state: string | null;
  memberCount: number;
  lastSession: string | null;
};

type SortKey = "name" | "type" | "location";
type SortDir = "asc" | "desc";

const TYPE_LABEL = (t: string) => (t === "free_play" ? "Free Play" : "Ladder");
const LOCATION_LABEL = (g: GroupRow) =>
  [g.city, g.state].filter(Boolean).join(", ") || "—";

export function GroupsTable({
  groups,
  toggleActive,
  renameGroup,
}: {
  groups: GroupRow[];
  toggleActive: (formData: FormData) => Promise<void>;
  renameGroup: (formData: FormData) => Promise<void>;
}) {
  // Mobile-only sort. Desktop keeps the DataTable's clickable headers
  // and priority-based column hiding.
  const [mobileSortKey, setMobileSortKey] = useState<SortKey>("name");
  const [mobileSortDir, setMobileSortDir] = useState<SortDir>("asc");

  function toggleSort(key: SortKey) {
    if (mobileSortKey !== key) {
      setMobileSortKey(key);
      setMobileSortDir("asc");
    } else {
      setMobileSortDir((d) => (d === "asc" ? "desc" : "asc"));
    }
  }

  const sortedForMobile = useMemo(() => {
    const copy = [...groups];
    copy.sort((a, b) => {
      let av = "";
      let bv = "";
      if (mobileSortKey === "name") {
        av = a.name.toLowerCase();
        bv = b.name.toLowerCase();
      } else if (mobileSortKey === "type") {
        av = TYPE_LABEL(a.group_type).toLowerCase();
        bv = TYPE_LABEL(b.group_type).toLowerCase();
      } else {
        av = LOCATION_LABEL(a).toLowerCase();
        bv = LOCATION_LABEL(b).toLowerCase();
      }
      const cmp = av.localeCompare(bv);
      return mobileSortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [groups, mobileSortKey, mobileSortDir]);

  const columns: Column<GroupRow>[] = [
    {
      key: "name",
      header: "Name",
      cell: (g) => <span className="font-medium text-dark-100">{g.name}</span>,
      sortValue: (g) => g.name.toLowerCase(),
      sortable: true,
      priority: "primary",
    },
    {
      key: "type",
      header: "Type",
      cell: (g) => (
        <span className={g.group_type === "free_play" ? "badge-yellow" : "badge-blue"}>
          {TYPE_LABEL(g.group_type)}
        </span>
      ),
      sortValue: (g) => TYPE_LABEL(g.group_type).toLowerCase(),
      sortable: true,
      priority: "secondary",
    },
    {
      key: "location",
      header: "Location",
      cell: (g) => <span className="text-dark-200">{LOCATION_LABEL(g)}</span>,
      sortValue: (g) => LOCATION_LABEL(g).toLowerCase(),
      sortable: true,
      priority: "secondary",
    },
    {
      key: "visibility",
      header: "Visibility",
      cell: (g) =>
        g.visibility === "private" ? (
          <span className="badge-gray">Private</span>
        ) : (
          <span className="badge-green">Public</span>
        ),
      priority: "tertiary",
    },
    {
      key: "slug",
      header: "Slug",
      cell: (g) => <span className="text-surface-muted">{g.slug}</span>,
      priority: "tertiary",
    },
    {
      key: "members",
      header: "Members",
      cell: (g) => g.memberCount,
      sortValue: (g) => g.memberCount,
      sortable: true,
      align: "right",
      priority: "primary",
    },
    {
      key: "last_session",
      header: "Last Session",
      cell: (g) => (g.lastSession ? formatDate(g.lastSession) : "None"),
      sortValue: (g) => g.lastSession ?? "",
      sortable: true,
      align: "right",
      priority: "tertiary",
    },
    {
      key: "active",
      header: "Active",
      cell: (g) =>
        g.is_active ? <span className="badge-green">Active</span> : <span className="badge-gray">Inactive</span>,
      align: "center",
      priority: "primary",
    },
    {
      key: "actions",
      header: "",
      cell: (g) => (
        <div className="flex items-center justify-end gap-2 flex-wrap text-sm">
          <Link href={`/admin/groups/${g.id}`} className="text-brand-vivid hover:opacity-80">
            Edit
          </Link>
          {g.is_active ? (
            <ConfirmFormButton
              action={toggleActive}
              hiddenInputs={{ groupId: g.id, currentActive: "true" }}
              label="Deactivate"
              confirmTitle={`Deactivate "${g.name}"?`}
              confirmDescription="Members will no longer be able to access this group until it is reactivated."
              confirmLabel="Deactivate"
              variant="danger"
              className="text-adaptive-red hover:text-red-500"
            />
          ) : (
            <form action={toggleActive} className="inline">
              <input type="hidden" name="groupId" value={g.id} />
              <input type="hidden" name="currentActive" value="false" />
              <button type="submit" className="text-teal-500 hover:opacity-80">
                Activate
              </button>
            </form>
          )}
          <RenameForm groupId={g.id} currentName={g.name} action={renameGroup} />
        </div>
      ),
      align: "right",
      priority: "primary",
    },
  ];

  if (groups.length === 0) {
    return (
      <DataTable
        data={groups}
        columns={columns}
        keyFn={(g) => g.id}
        empty={{
          title: "No groups created yet",
          description: "Use the form above to create the first one.",
          illustration: <EmptyIllustrationGroups />,
        }}
      />
    );
  }

  return (
    <>
      {/* Desktop: sortable DataTable (auto-hide columns below sm).
          The old mobileMode="cards" rendered 7 label/value rows per
          group — unreadable. On mobile we render the compact list
          below instead. */}
      <div className="hidden sm:block">
        <DataTable
          data={groups}
          columns={columns}
          keyFn={(g) => g.id}
          mobileMode="auto-hide"
          caption="All shootout groups"
        />
      </div>

      {/* Mobile: compact sortable list matching the Admin > Sessions
          layout. Destructive actions (Deactivate/Rename) live on the
          detail page so the row stays a single tap target. */}
      <div className="sm:hidden space-y-2">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-surface-muted font-medium uppercase tracking-wide">
            Sort
          </span>
          <SortChip
            label="Name"
            active={mobileSortKey === "name"}
            direction={mobileSortDir}
            onClick={() => toggleSort("name")}
          />
          <SortChip
            label="Type"
            active={mobileSortKey === "type"}
            direction={mobileSortDir}
            onClick={() => toggleSort("type")}
          />
          <SortChip
            label="Location"
            active={mobileSortKey === "location"}
            direction={mobileSortDir}
            onClick={() => toggleSort("location")}
          />
        </div>

        <ul className="divide-y divide-surface-border rounded-xl ring-1 ring-surface-border bg-surface-raised overflow-hidden">
          {sortedForMobile.map((g) => (
            <li key={g.id} className="flex items-stretch">
              {/* Main row: tap to open the edit page. Flex child is the
                  Link, not the li, so the destructive action button
                  can sit beside it without nesting a <button> inside
                  an <a> (invalid HTML + event bubbling headaches). */}
              <Link
                href={`/admin/groups/${g.id}`}
                className="flex items-center gap-3 flex-1 min-w-0 px-4 py-3 hover:bg-surface-overlay/50 transition-colors active:bg-surface-overlay"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-dark-100 truncate">
                      {g.name}
                    </p>
                    <span
                      className={
                        g.group_type === "free_play"
                          ? "badge-yellow shrink-0"
                          : "badge-blue shrink-0"
                      }
                    >
                      {TYPE_LABEL(g.group_type)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-surface-muted truncate">
                    <span className="text-dark-200">{LOCATION_LABEL(g)}</span>
                    <span className="mx-1.5">·</span>
                    {g.memberCount} {g.memberCount === 1 ? "member" : "members"}
                    {!g.is_active && (
                      <>
                        <span className="mx-1.5">·</span>
                        <span className="text-dark-300">Inactive</span>
                      </>
                    )}
                    {g.visibility === "private" && (
                      <>
                        <span className="mx-1.5">·</span>
                        <span>Private</span>
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
              {/* Trailing destructive action — Deactivate for active
                  groups (soft-delete), Activate for inactive ones.
                  Rename stays on the detail page to keep the list
                  compact. */}
              <div className="flex items-center border-l border-surface-border px-3">
                {g.is_active ? (
                  <ConfirmFormButton
                    action={toggleActive}
                    hiddenInputs={{ groupId: g.id, currentActive: "true" }}
                    label="Deactivate"
                    confirmTitle={`Deactivate "${g.name}"?`}
                    confirmDescription="Members will no longer be able to access this group until it is reactivated."
                    confirmLabel="Deactivate"
                    variant="danger"
                    className="text-xs font-medium text-adaptive-red hover:text-red-500 px-1 py-2"
                  />
                ) : (
                  <form action={toggleActive} className="inline">
                    <input type="hidden" name="groupId" value={g.id} />
                    <input type="hidden" name="currentActive" value="false" />
                    <button
                      type="submit"
                      className="text-xs font-medium text-teal-500 hover:opacity-80 px-1 py-2"
                    >
                      Activate
                    </button>
                  </form>
                )}
              </div>
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

/** Inline rename form in a dropdown-like <details> disclosure. */
function RenameForm({
  groupId,
  currentName,
  action,
}: {
  groupId: string;
  currentName: string;
  action: (formData: FormData) => Promise<void>;
}) {
  return (
    <details className="relative inline-block">
      <summary className="cursor-pointer list-none text-surface-muted hover:text-dark-100">
        Rename
      </summary>
      <div className="absolute right-0 top-6 z-10 w-64 rounded-lg border border-surface-border bg-surface-raised p-3 shadow-lg">
        <form action={action} className="flex flex-col gap-2">
          <input type="hidden" name="groupId" value={groupId} />
          <input type="text" name="newName" defaultValue={currentName} required className="input" />
          <button type="submit" className="btn-secondary text-sm">
            Save
          </button>
        </form>
      </div>
    </details>
  );
}
