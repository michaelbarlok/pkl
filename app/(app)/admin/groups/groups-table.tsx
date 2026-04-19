"use client";

import Link from "next/link";
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
  memberCount: number;
  lastSession: string | null;
};

export function GroupsTable({
  groups,
  toggleActive,
  renameGroup,
}: {
  groups: GroupRow[];
  toggleActive: (formData: FormData) => Promise<void>;
  renameGroup: (formData: FormData) => Promise<void>;
}) {
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
          {g.group_type === "free_play" ? "Free Play" : "Ladder"}
        </span>
      ),
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
      priority: "secondary",
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
          <Link href={`/admin/groups/${g.id}`} className="text-brand-400 hover:text-brand-300">
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
              <button type="submit" className="text-teal-300 hover:text-teal-200">
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

  return (
    <DataTable
      data={groups}
      columns={columns}
      keyFn={(g) => g.id}
      mobileMode="cards"
      caption="All shootout groups"
      empty={{
        title: "No groups created yet",
        description: "Use the form above to create the first one.",
        illustration: <EmptyIllustrationGroups />,
      }}
    />
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
