"use client";

import { useConfirm } from "@/components/confirm-modal";
import { EmptyState } from "@/components/empty-state";
import { useSupabase } from "@/components/providers/supabase-provider";
import { useToast } from "@/components/toast";
import { cn, formatDate } from "@/lib/utils";
import type { Profile } from "@/types/database";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useEffect, useRef } from "react";

interface MembershipInfo {
  step: number;
  groupName: string;
  groupId: string;
  groupRole: string;
}

interface MembersTableProps {
  profiles: Profile[];
  membershipMap: Record<string, MembershipInfo[]>;
  currentProfileId: string;
}

type StatusFilter = "all" | "active" | "inactive";
type RoleFilter = "all" | "admin" | "player";

export function MembersTable({ profiles, membershipMap, currentProfileId }: MembersTableProps) {
  const { supabase } = useSupabase();
  const { toast } = useToast();
  const confirm = useConfirm();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [suspending, setSuspending] = useState<string | null>(null);
  const [togglingGroupRole, setTogglingGroupRole] = useState<string | null>(null);
  const [togglingGlobalRole, setTogglingGlobalRole] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const filtered = useMemo(() => {
    let result = profiles;

    // Search by name or email
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (p) =>
          p.display_name.toLowerCase().includes(q) ||
          p.full_name.toLowerCase().includes(q) ||
          p.email.toLowerCase().includes(q)
      );
    }

    // Filter by active status
    if (statusFilter === "active") {
      result = result.filter((p) => p.is_active);
    } else if (statusFilter === "inactive") {
      result = result.filter((p) => !p.is_active);
    }

    // Filter by role
    if (roleFilter !== "all") {
      result = result.filter((p) => p.role === roleFilter);
    }

    return result;
  }, [profiles, search, statusFilter, roleFilter]);

  // Selectable = filtered members excluding yourself
  const selectableIds = useMemo(
    () => filtered.filter((p) => p.id !== currentProfileId).map((p) => p.id),
    [filtered, currentProfileId]
  );

  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selectedIds.has(id));
  const someSelected = selectedIds.size > 0;

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(selectableIds));
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  async function handleSuspend(profileId: string, currentlyActive: boolean) {
    setSuspending(profileId);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ is_active: !currentlyActive })
        .eq("id", profileId);

      if (error) throw error;
      router.refresh();
    } catch (err) {
      console.error("Failed to update member status:", err);
    } finally {
      setSuspending(null);
    }
  }

  async function handleToggleGroupRole(
    playerId: string,
    groupId: string,
    currentRole: string
  ) {
    const key = `${playerId}-${groupId}`;
    setTogglingGroupRole(key);
    try {
      const res = await fetch("/api/admin/group-role", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerId,
          groupId,
          groupRole: currentRole === "admin" ? "member" : "admin",
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast(data.error || "Failed to update group role.", "error");
      }
      router.refresh();
    } catch {
      toast("Failed to update group role.", "error");
    } finally {
      setTogglingGroupRole(null);
    }
  }

  async function handleToggleGlobalRole(playerId: string, currentRole: string) {
    const newRole = currentRole === "admin" ? "player" : "admin";
    const isPromoting = newRole === "admin";
    const ok = await confirm({
      title: isPromoting ? "Promote to global admin?" : "Remove global admin?",
      description: isPromoting
        ? "This member will have full access to all admin features across the entire app."
        : "This member will lose all global admin privileges.",
      confirmLabel: isPromoting ? "Promote" : "Remove Admin",
      variant: isPromoting ? "default" : "warning",
    });
    if (!ok) return;

    setTogglingGlobalRole(playerId);
    try {
      const res = await fetch("/api/admin/global-role", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId, role: newRole }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast(data.error || "Failed to update global role.", "error");
      }
      router.refresh();
    } catch {
      toast("Failed to update global role.", "error");
    } finally {
      setTogglingGlobalRole(null);
    }
  }

  async function handleDelete(profileId: string, displayName: string) {
    const ok = await confirm({
      title: `Delete ${displayName}?`,
      description: "This will permanently remove them from all groups, sessions, and tournaments. This cannot be undone.",
      confirmLabel: "Delete Member",
      variant: "danger",
    });
    if (!ok) return;

    setDeleting(profileId);
    try {
      const res = await fetch("/api/admin/delete-member", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId: profileId }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast(data.error || "Failed to delete member.", "error");
      } else {
        toast(`${displayName} has been permanently deleted.`, "success");
      }
      router.refresh();
    } catch {
      toast("Failed to delete member.", "error");
    } finally {
      setDeleting(null);
    }
  }

  async function handleBulkDelete() {
    const count = selectedIds.size;
    const ok = await confirm({
      title: `Delete ${count} member${count !== 1 ? "s" : ""}?`,
      description: `All ${count} selected member${count !== 1 ? "s" : ""} will be permanently removed from all groups, sessions, and tournaments. This cannot be undone.`,
      confirmLabel: `Delete ${count} Member${count !== 1 ? "s" : ""}`,
      variant: "danger",
    });
    if (!ok) return;

    setBulkDeleting(true);
    try {
      const res = await fetch("/api/admin/bulk-delete-members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerIds: [...selectedIds] }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error || "Bulk delete failed.", "error");
      } else {
        toast(`${data.deleted} member${data.deleted !== 1 ? "s" : ""} permanently deleted.`, "success");
        setSelectedIds(new Set());
      }
      router.refresh();
    } catch {
      toast("Bulk delete failed.", "error");
    } finally {
      setBulkDeleting(false);
    }
  }

  function exportCSV() {
    const headers = [
      "Name",
      "Email",
      "Skill Level",
      "Role",
      "Active",
      "Member Since",
      "Groups & Steps",
    ];

    const rows = filtered.map((p) => {
      const memberships = membershipMap[p.id] ?? [];
      const groupSteps = memberships
        .map((m) => `${m.groupName} (Step ${m.step})`)
        .join("; ");

      return [
        p.display_name,
        p.email,
        p.skill_level?.toString() ?? "",
        p.role,
        p.is_active ? "Yes" : "No",
        formatDate(p.member_since),
        groupSteps,
      ];
    });

    const csvContent = [headers, ...rows]
      .map((row) =>
        row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(",")
      )
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `members-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-wrap gap-3">
          {/* Search */}
          <input
            type="text"
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input max-w-xs"
          />

          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="input w-auto"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>

          {/* Role filter */}
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as RoleFilter)}
            className="input w-auto"
          >
            <option value="all">All Roles</option>
            <option value="admin">Admin</option>
            <option value="player">Player</option>
          </select>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={exportCSV}
            className="btn-secondary text-sm"
          >
            Export CSV
          </button>
          <Link href="/admin/members/invite" className="btn-primary text-sm">
            Invite Member
          </Link>
        </div>
      </div>

      {/* Results count */}
      <p className="text-sm text-surface-muted">
        Showing {filtered.length} of {profiles.length} members
        {someSelected && (
          <span className="ml-2 text-red-400 font-medium">
            · {selectedIds.size} selected
          </span>
        )}
      </p>

      {/* Mobile card layout */}
      <div className="space-y-3 sm:hidden">
        {/* Mobile: check-all bar */}
        {selectableIds.length > 0 && (
          <div className="flex items-center gap-3 px-1">
            <input
              type="checkbox"
              id="select-all-mobile"
              checked={allSelected}
              onChange={toggleSelectAll}
              className="h-4 w-4 rounded border-surface-border bg-surface-overlay text-brand-500 focus:ring-brand-500"
            />
            <label htmlFor="select-all-mobile" className="text-sm text-surface-muted cursor-pointer">
              {allSelected ? "Deselect all" : "Select all"}
            </label>
          </div>
        )}

        {filtered.map((profile) => {
          const memberships = membershipMap[profile.id] ?? [];
          const isSelf = profile.id === currentProfileId;
          const isSelected = selectedIds.has(profile.id);
          return (
            <div
              key={profile.id}
              className={cn("card space-y-3", isSelected && "ring-1 ring-red-500/50")}
            >
              {/* Header: checkbox + avatar + name + status + actions */}
              <div className="flex items-center gap-3">
                {!isSelf && (
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelect(profile.id)}
                    className="h-4 w-4 rounded border-surface-border bg-surface-overlay text-brand-500 focus:ring-brand-500 flex-shrink-0"
                  />
                )}
                {profile.avatar_url ? (
                  <img
                    src={profile.avatar_url}
                    alt=""
                    className="h-10 w-10 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-900/50 text-brand-300 font-medium">
                    {profile.display_name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <Link
                    href={`/players/${profile.id}`}
                    className="text-sm font-semibold text-dark-100 hover:text-brand-400 truncate block"
                  >
                    {profile.display_name}
                  </Link>
                  <p className="text-xs text-surface-muted truncate">{profile.email}</p>
                </div>
                <span className={profile.is_active ? "badge-green" : "badge-red"}>
                  {profile.is_active ? "Active" : "Inactive"}
                </span>
                <ActionsDropdown
                  profile={profile}
                  memberships={memberships}
                  currentProfileId={currentProfileId}
                  suspending={suspending}
                  togglingGlobalRole={togglingGlobalRole}
                  togglingGroupRole={togglingGroupRole}
                  deleting={deleting}
                  onSuspend={handleSuspend}
                  onToggleGlobalRole={handleToggleGlobalRole}
                  onToggleGroupRole={handleToggleGroupRole}
                  onDelete={handleDelete}
                />
              </div>

              {/* Details row */}
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-surface-muted">
                {profile.skill_level && <span>Skill {profile.skill_level}</span>}
                <span className="capitalize">{profile.role}</span>
                {memberships.map((m, i) => (
                  <span key={i} className={cn(m.groupRole === "admin" ? "text-accent-300" : "text-brand-300")}>
                    {m.groupRole === "admin" ? "★ " : ""}{m.groupName}: Step {m.step}
                  </span>
                ))}
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <EmptyState
            title="No members found"
            description="No members match your current filters."
          />
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden sm:block overflow-x-auto rounded-lg border border-surface-border">
        <table className="min-w-full divide-y divide-surface-border">
          <thead className="bg-surface-overlay">
            <tr>
              {/* Check-all column */}
              <th className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleSelectAll}
                  disabled={selectableIds.length === 0}
                  className="h-4 w-4 rounded border-surface-border bg-surface-overlay text-brand-500 focus:ring-brand-500 disabled:opacity-30"
                  aria-label="Select all members"
                />
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-surface-muted">
                Member
              </th>
              <th className="hidden md:table-cell px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-surface-muted">
                Email
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-surface-muted">
                Skill
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-surface-muted">
                Step
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-surface-muted">
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-surface-muted">
                Role
              </th>
              <th className="w-10 px-4 py-3">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border bg-surface-raised">
            {filtered.map((profile) => {
              const memberships = membershipMap[profile.id] ?? [];
              const isSelf = profile.id === currentProfileId;
              const isSelected = selectedIds.has(profile.id);
              return (
                <tr
                  key={profile.id}
                  className={cn(
                    "hover:bg-surface-overlay",
                    isSelected && "bg-red-900/10"
                  )}
                >
                  {/* Per-row checkbox */}
                  <td className="px-4 py-3">
                    {!isSelf && (
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(profile.id)}
                        className="h-4 w-4 rounded border-surface-border bg-surface-overlay text-brand-500 focus:ring-brand-500"
                        aria-label={`Select ${profile.display_name}`}
                      />
                    )}
                  </td>

                  {/* Avatar + Name */}
                  <td className="whitespace-nowrap px-4 py-3">
                    <div className="flex items-center gap-3">
                      {profile.avatar_url ? (
                        <img
                          src={profile.avatar_url}
                          alt=""
                          className="h-8 w-8 rounded-full object-cover"
                        />
                      ) : (
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-900/50 text-brand-300 text-sm font-medium">
                          {profile.display_name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <Link
                        href={`/players/${profile.id}`}
                        className="text-sm font-medium text-dark-100 hover:text-brand-400"
                      >
                        {profile.display_name}
                      </Link>
                    </div>
                  </td>

                  {/* Email */}
                  <td className="hidden md:table-cell whitespace-nowrap px-4 py-3 text-sm text-surface-muted">
                    {profile.email}
                  </td>

                  {/* Skill Level */}
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-surface-muted">
                    {profile.skill_level ?? "—"}
                  </td>

                  {/* Step (from group memberships) */}
                  <td className="px-4 py-3 text-sm text-surface-muted">
                    {memberships.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {memberships.map((m, i) => (
                          <span key={i} className={cn("text-xs", m.groupRole === "admin" ? "badge-yellow" : "badge-blue")}>
                            {m.groupRole === "admin" ? "★ " : ""}{m.groupName}: {m.step}
                          </span>
                        ))}
                      </div>
                    ) : (
                      "—"
                    )}
                  </td>

                  {/* Status */}
                  <td className="whitespace-nowrap px-4 py-3">
                    <span
                      className={
                        profile.is_active ? "badge-green" : "badge-red"
                      }
                    >
                      {profile.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>

                  {/* Role */}
                  <td className="whitespace-nowrap px-4 py-3">
                    <span
                      className={
                        profile.role === "admin" ? "badge-yellow" : "badge-gray"
                      }
                    >
                      {profile.role}
                    </span>
                  </td>

                  {/* Actions dropdown */}
                  <td className="px-4 py-3 text-right">
                    <ActionsDropdown
                      profile={profile}
                      memberships={memberships}
                      currentProfileId={currentProfileId}
                      suspending={suspending}
                      togglingGlobalRole={togglingGlobalRole}
                      togglingGroupRole={togglingGroupRole}
                      deleting={deleting}
                      onSuspend={handleSuspend}
                      onToggleGlobalRole={handleToggleGlobalRole}
                      onToggleGroupRole={handleToggleGroupRole}
                      onDelete={handleDelete}
                    />
                  </td>
                </tr>
              );
            })}

            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-8 text-center text-sm text-surface-muted"
                >
                  No members found matching your filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Floating bulk action toolbar */}
      {someSelected && (
        <div className="fixed bottom-16 md:bottom-6 inset-x-4 z-40 flex justify-center pointer-events-none">
          <div className="pointer-events-auto animate-slide-up flex items-center gap-3 rounded-xl bg-dark-900 px-4 py-2.5 shadow-2xl ring-1 ring-surface-border">
            <span className="text-sm font-semibold text-dark-100 whitespace-nowrap">
              {selectedIds.size} selected
            </span>
            <div className="h-4 w-px bg-surface-border shrink-0" />
            <button
              onClick={() => setSelectedIds(new Set())}
              className="text-sm text-surface-muted hover:text-dark-100 transition-colors whitespace-nowrap"
            >
              Clear
            </button>
            <button
              onClick={handleBulkDelete}
              disabled={bulkDeleting}
              className="btn-danger btn-sm whitespace-nowrap"
            >
              {bulkDeleting ? "Deleting…" : `Delete ${selectedIds.size}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Actions Dropdown
// ============================================================

function ActionsDropdown({
  profile,
  memberships,
  currentProfileId,
  suspending,
  togglingGlobalRole,
  togglingGroupRole,
  deleting,
  onSuspend,
  onToggleGlobalRole,
  onToggleGroupRole,
  onDelete,
}: {
  profile: Profile;
  memberships: MembershipInfo[];
  currentProfileId: string;
  suspending: string | null;
  togglingGlobalRole: string | null;
  togglingGroupRole: string | null;
  deleting: string | null;
  onSuspend: (id: string, active: boolean) => void;
  onToggleGlobalRole: (id: string, role: string) => void;
  onToggleGroupRole: (id: string, groupId: string, role: string) => void;
  onDelete: (id: string, displayName: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [groupAdminOpen, setGroupAdminOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setGroupAdminOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const isSelf = profile.id === currentProfileId;

  return (
    <div className="relative inline-block text-left" ref={ref}>
      <button
        type="button"
        onClick={() => { setOpen(!open); setGroupAdminOpen(false); }}
        className="rounded-md p-1.5 text-surface-muted hover:bg-surface-overlay hover:text-dark-100 transition-colors"
        aria-label="Member actions"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
          <path d="M10 3a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3ZM10 8.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3ZM11.5 15.5a1.5 1.5 0 1 0-3 0 1.5 1.5 0 0 0 3 0Z" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-1 w-52 rounded-lg bg-surface-raised shadow-xl ring-1 ring-surface-border py-1">
          {/* Make Global Admin */}
          {!isSelf && (
            <button
              type="button"
              onClick={() => { onToggleGlobalRole(profile.id, profile.role); setOpen(false); }}
              disabled={togglingGlobalRole === profile.id}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-dark-200 hover:bg-surface-overlay disabled:opacity-50"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-brand-400">
                <path fillRule="evenodd" d="M10 1a4.5 4.5 0 0 0-4.5 4.5V9H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-.5V5.5A4.5 4.5 0 0 0 10 1Zm3 8V5.5a3 3 0 1 0-6 0V9h6Z" clipRule="evenodd" />
              </svg>
              {togglingGlobalRole === profile.id
                ? "Updating..."
                : profile.role === "admin"
                  ? "Remove Global Admin"
                  : "Make Global Admin"}
            </button>
          )}

          {/* Make Group Admin (with nested submenu) */}
          {memberships.length > 0 && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setGroupAdminOpen(!groupAdminOpen)}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-sm text-dark-200 hover:bg-surface-overlay"
              >
                <span className="flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-amber-400">
                    <path d="M10 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM6 8a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM1.49 15.326a.78.78 0 0 1-.358-.442 3 3 0 0 1 4.308-3.516 6.484 6.484 0 0 0-1.905 3.959c-.023.222-.014.442.025.654a4.97 4.97 0 0 1-2.07-.655ZM16.44 15.98a4.97 4.97 0 0 0 2.07-.654.78.78 0 0 0 .357-.442 3 3 0 0 0-4.308-3.517 6.484 6.484 0 0 1 1.907 3.96 2.32 2.32 0 0 1-.026.654ZM18 8a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM5.304 16.19a.844.844 0 0 1-.277-.71 5 5 0 0 1 9.947 0 .843.843 0 0 1-.277.71A6.975 6.975 0 0 1 10 18a6.974 6.974 0 0 1-4.696-1.81Z" />
                  </svg>
                  Group Admin
                </span>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={cn("h-4 w-4 transition-transform", groupAdminOpen && "rotate-180")}>
                  <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                </svg>
              </button>

              {groupAdminOpen && (
                <div className="border-t border-surface-border bg-surface-overlay/50">
                  {memberships.map((m) => {
                    const key = `${profile.id}-${m.groupId}`;
                    const isGroupAdmin = m.groupRole === "admin";
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => { onToggleGroupRole(profile.id, m.groupId, m.groupRole); setOpen(false); setGroupAdminOpen(false); }}
                        disabled={togglingGroupRole === key}
                        className="flex w-full items-center gap-2 px-5 py-1.5 text-sm hover:bg-surface-overlay disabled:opacity-50"
                      >
                        {isGroupAdmin ? (
                          <span className="text-yellow-300">★ {m.groupName}</span>
                        ) : (
                          <span className="text-surface-muted">{m.groupName}</span>
                        )}
                        {togglingGroupRole === key && (
                          <span className="text-xs text-surface-muted ml-auto">...</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Divider */}
          <div className="my-1 border-t border-surface-border" />

          {/* Edit */}
          <Link
            href={`/players/${profile.id}/edit`}
            onClick={() => setOpen(false)}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-dark-200 hover:bg-surface-overlay"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-brand-400">
              <path d="m5.433 13.917 1.262-3.155A4 4 0 0 1 7.58 9.42l6.92-6.918a2.121 2.121 0 0 1 3 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 0 1-.65-.65Z" />
              <path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0 0 10 3H4.75A2.75 2.75 0 0 0 2 5.75v9.5A2.75 2.75 0 0 0 4.75 18h9.5A2.75 2.75 0 0 0 17 15.25V10a.75.75 0 0 0-1.5 0v5.25c0 .69-.56 1.25-1.25 1.25h-9.5c-.69 0-1.25-.56-1.25-1.25v-9.5Z" />
            </svg>
            Edit
          </Link>

          {/* Suspend / Activate */}
          <button
            type="button"
            onClick={() => { onSuspend(profile.id, profile.is_active); setOpen(false); }}
            disabled={suspending === profile.id}
            className={cn(
              "flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-surface-overlay disabled:opacity-50",
              profile.is_active ? "text-red-400" : "text-teal-300"
            )}
          >
            {profile.is_active ? (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                <path fillRule="evenodd" d="M2 10a8 8 0 1 1 16 0 8 8 0 0 1-16 0Zm5-2.25A.75.75 0 0 1 7.75 7h.5a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-.75.75h-.5a.75.75 0 0 1-.75-.75v-4.5Zm4 0a.75.75 0 0 1 .75-.75h.5a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-.75.75h-.5a.75.75 0 0 1-.75-.75v-4.5Z" clipRule="evenodd" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM9.555 7.168A1 1 0 0 0 8 8v4a1 1 0 0 0 1.555.832l3-2a1 1 0 0 0 0-1.664l-3-2Z" clipRule="evenodd" />
              </svg>
            )}
            {suspending === profile.id
              ? "Updating..."
              : profile.is_active
                ? "Suspend"
                : "Activate"}
          </button>

          {/* Delete Member */}
          {!isSelf && (
            <>
              <div className="my-1 border-t border-surface-border" />
              <button
                type="button"
                onClick={() => { onDelete(profile.id, profile.display_name); setOpen(false); }}
                disabled={deleting === profile.id}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-400/10 disabled:opacity-50"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                  <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z" clipRule="evenodd" />
                </svg>
                {deleting === profile.id ? "Deleting..." : "Delete Member"}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
