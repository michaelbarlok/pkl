"use client";

import { useSupabase } from "@/components/providers/supabase-provider";
import { cn } from "@/lib/utils";
import type { Profile } from "@/types/database";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

interface MembersTableProps {
  profiles: Profile[];
  membershipMap: Record<string, { step: number; groupName: string }[]>;
}

type StatusFilter = "all" | "active" | "inactive";
type RoleFilter = "all" | "admin" | "player";

export function MembersTable({ profiles, membershipMap }: MembersTableProps) {
  const { supabase } = useSupabase();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [suspending, setSuspending] = useState<string | null>(null);

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
        new Date(p.member_since).toLocaleDateString(),
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
        <div className="flex flex-1 gap-3">
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

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-surface-border">
        <table className="min-w-full divide-y divide-surface-border">
          <thead className="bg-surface-overlay">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-surface-muted">
                Member
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-surface-muted">
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
                        className="text-sm font-medium text-dark-100 hover:text-brand-600"
                      >
                        {profile.display_name}
                      </Link>
                    </div>
                  </td>

                  {/* Email */}
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-surface-muted">
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
                          <span key={i} className="badge-blue text-xs">
                            {m.groupName}: {m.step}
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
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        href={`/players/${profile.id}/edit`}
                        className="text-sm text-brand-600 hover:text-brand-500"
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
                            ? "text-red-400 hover:text-red-500"
                            : "text-teal-300 hover:text-green-500",
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
