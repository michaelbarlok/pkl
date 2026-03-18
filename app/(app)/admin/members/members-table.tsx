"use client";

import { EmptyState } from "@/components/empty-state";
import { useSupabase } from "@/components/providers/supabase-provider";
import { useToast } from "@/components/toast";
import { cn, formatDate } from "@/lib/utils";
import type { Profile } from "@/types/database";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

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
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [suspending, setSuspending] = useState<string | null>(null);
  const [togglingGroupRole, setTogglingGroupRole] = useState<string | null>(null);
  const [togglingGlobalRole, setTogglingGlobalRole] = useState<string | null>(null);

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
    const action = newRole === "admin" ? "promote to global admin" : "remove global admin";
    if (!confirm(`Are you sure you want to ${action} this member?`)) return;

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
      </p>

      {/* Mobile card layout */}
      <div className="space-y-3 sm:hidden">
        {filtered.map((profile) => {
          const memberships = membershipMap[profile.id] ?? [];
          return (
            <div key={profile.id} className="card space-y-3">
              {/* Header: avatar + name + status */}
              <div className="flex items-center gap-3">
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

              {/* Actions */}
              <div className="flex items-center gap-2 flex-wrap border-t border-surface-border pt-2">
                {profile.id !== currentProfileId && (
                  <button
                    type="button"
                    onClick={() => handleToggleGlobalRole(profile.id, profile.role)}
                    disabled={togglingGlobalRole === profile.id}
                    className={cn(
                      "text-xs px-2 py-1 rounded",
                      profile.role === "admin"
                        ? "bg-red-900/30 text-red-300 hover:bg-red-900/50"
                        : "bg-purple-900/30 text-purple-300 hover:bg-purple-900/50",
                      togglingGlobalRole === profile.id && "opacity-50"
                    )}
                  >
                    {togglingGlobalRole === profile.id
                      ? "..."
                      : profile.role === "admin"
                        ? "Remove Admin"
                        : "Make Admin"}
                  </button>
                )}
                {memberships.map((m) => {
                  const key = `${profile.id}-${m.groupId}`;
                  const isGroupAdmin = m.groupRole === "admin";
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => handleToggleGroupRole(profile.id, m.groupId, m.groupRole)}
                      disabled={togglingGroupRole === key}
                      className={cn(
                        "text-xs px-2 py-1 rounded",
                        isGroupAdmin
                          ? "bg-yellow-900/30 text-yellow-300 hover:bg-yellow-900/50"
                          : "bg-surface-overlay text-surface-muted hover:text-dark-100",
                        togglingGroupRole === key && "opacity-50"
                      )}
                    >
                      {togglingGroupRole === key
                        ? "..."
                        : isGroupAdmin
                          ? `★ ${m.groupName}`
                          : `${m.groupName} Admin`}
                    </button>
                  );
                })}
                <Link
                  href={`/players/${profile.id}/edit`}
                  className="text-xs text-brand-400 hover:text-brand-300"
                >
                  Edit
                </Link>
                <button
                  type="button"
                  onClick={() => handleSuspend(profile.id, profile.is_active)}
                  disabled={suspending === profile.id}
                  className={cn(
                    "text-xs",
                    profile.is_active
                      ? "text-red-400 hover:text-red-300"
                      : "text-teal-300 hover:text-teal-200",
                    suspending === profile.id && "opacity-50"
                  )}
                >
                  {suspending === profile.id
                    ? "..."
                    : profile.is_active
                      ? "Suspend"
                      : "Activate"}
                </button>
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
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-surface-muted">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border bg-surface-raised">
            {filtered.map((profile) => {
              const memberships = membershipMap[profile.id] ?? [];
              return (
                <tr key={profile.id} className="hover:bg-surface-overlay">
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

                  {/* Actions */}
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2 flex-wrap">
                      {profile.id !== currentProfileId && (
                        <button
                          type="button"
                          onClick={() => handleToggleGlobalRole(profile.id, profile.role)}
                          disabled={togglingGlobalRole === profile.id}
                          className={cn(
                            "text-xs px-2 py-1 rounded",
                            profile.role === "admin"
                              ? "bg-red-900/30 text-red-300 hover:bg-red-900/50"
                              : "bg-purple-900/30 text-purple-300 hover:bg-purple-900/50",
                            togglingGlobalRole === profile.id && "opacity-50"
                          )}
                          title={profile.role === "admin" ? "Remove global admin" : "Make global admin"}
                        >
                          {togglingGlobalRole === profile.id
                            ? "..."
                            : profile.role === "admin"
                              ? "Remove Global Admin"
                              : "Make Global Admin"}
                        </button>
                      )}
                      {memberships.map((m) => {
                        const key = `${profile.id}-${m.groupId}`;
                        const isGroupAdmin = m.groupRole === "admin";
                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() =>
                              handleToggleGroupRole(profile.id, m.groupId, m.groupRole)
                            }
                            disabled={togglingGroupRole === key}
                            className={cn(
                              "text-xs px-2 py-1 rounded",
                              isGroupAdmin
                                ? "bg-yellow-900/30 text-yellow-300 hover:bg-yellow-900/50"
                                : "bg-surface-overlay text-surface-muted hover:text-dark-100",
                              togglingGroupRole === key && "opacity-50"
                            )}
                            title={isGroupAdmin ? `Remove ${m.groupName} admin` : `Make ${m.groupName} admin`}
                          >
                            {togglingGroupRole === key
                              ? "..."
                              : isGroupAdmin
                                ? `★ ${m.groupName} Admin`
                                : `Make ${m.groupName} Admin`}
                          </button>
                        );
                      })}
                      <Link
                        href={`/players/${profile.id}/edit`}
                        className="text-sm text-brand-400 hover:text-brand-300"
                      >
                        Edit
                      </Link>
                      <button
                        type="button"
                        onClick={() =>
                          handleSuspend(profile.id, profile.is_active)
                        }
                        disabled={suspending === profile.id}
                        className={cn(
                          "text-sm",
                          profile.is_active
                            ? "text-red-400 hover:text-red-300"
                            : "text-teal-300 hover:text-teal-200",
                          suspending === profile.id && "opacity-50"
                        )}
                      >
                        {suspending === profile.id
                          ? "..."
                          : profile.is_active
                            ? "Suspend"
                            : "Activate"}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}

            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-8 text-center text-sm text-surface-muted"
                >
                  No members found matching your filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
