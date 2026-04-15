"use client";

import { useConfirm } from "@/components/confirm-modal";
import { EmptyState } from "@/components/empty-state";
import { useSupabase } from "@/components/providers/supabase-provider";
import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { cn, formatDate } from "@/lib/utils";
import type {
  ShootoutGroup,
  GroupPreferences,
  GroupMembership,
  Profile,
} from "@/types/database";
import { US_STATES } from "@/lib/us-states";

// ============================================================
// Types
// ============================================================

interface MemberRow extends Omit<GroupMembership, "player"> {
  player: Pick<Profile, "id" | "full_name" | "display_name" | "avatar_url" | "email">;
}

interface PendingMember {
  id: string;
  name: string;
  step: number | null;
  win_pct: number | null;
  total_sessions: number | null;
  last_played_at: string | null;
  invite_email: string | null;
}

type Tab = "members" | "preferences";

// ============================================================
// Page Component
// ============================================================

export default function AdminGroupDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { supabase } = useSupabase();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [group, setGroup] = useState<ShootoutGroup | null>(null);
  const [preferences, setPreferences] = useState<GroupPreferences | null>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [allPlayers, setAllPlayers] = useState<Profile[]>([]);
  const initialTab = (searchParams.get("tab") === "preferences" ? "preferences" : "members") as Tab;
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  const [loading, setLoading] = useState(true);
  const confirm = useConfirm();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Search state for adding members
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddPlayer, setShowAddPlayer] = useState(false);

  // Bulk-add state
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set());
  const [bulkAdding, setBulkAdding] = useState(false);

  // Pending members state
  const [pendingMembers, setPendingMembers] = useState<PendingMember[]>([]);
  const [linkingPendingId, setLinkingPendingId] = useState<string | null>(null);
  const [linkSearch, setLinkSearch] = useState("");

  // ============================================================
  // Data Fetching
  // ============================================================

  const fetchData = useCallback(async () => {
    setLoading(true);

    const [groupRes, prefsRes, membersRes, playersRes, pendingRes] = await Promise.all([
      supabase.from("shootout_groups").select("*").eq("id", id).single(),
      supabase.from("group_preferences").select("*").eq("group_id", id).single(),
      supabase
        .from("group_memberships")
        .select(
          "*, player:profiles!group_memberships_player_id_fkey(id, full_name, display_name, avatar_url, email)"
        )
        .eq("group_id", id)
        .order("current_step", { ascending: true })
        .order("win_pct", { ascending: false }),
      supabase
        .from("profiles")
        .select("*")
        .eq("is_active", true)
        .order("display_name", { ascending: true }),
      supabase
        .from("pending_group_members")
        .select("id, name, step, win_pct, total_sessions, last_played_at, invite_email")
        .eq("group_id", id)
        .is("claimed_by", null)
        .order("name", { ascending: true }),
    ]);

    if (groupRes.data) setGroup(groupRes.data);
    if (prefsRes.data) setPreferences(prefsRes.data);
    if (membersRes.data) setMembers(membersRes.data as MemberRow[]);
    if (playersRes.data) setAllPlayers(playersRes.data);
    if (pendingRes.data) setPendingMembers(pendingRes.data as PendingMember[]);

    setLoading(false);
  }, [supabase, id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Realtime: re-fetch members when group_memberships change (e.g. step updates from shootout)
  useEffect(() => {
    const channel = supabase
      .channel(`admin-group-${id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "group_memberships", filter: `group_id=eq.${id}` },
        () => {
          fetchData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, supabase, fetchData]);

  // ============================================================
  // Member Actions
  // ============================================================

  const addMember = async (playerId: string) => {
    const startStep = preferences?.new_player_start_step ?? 5;

    const { error } = await supabase.from("group_memberships").insert({
      group_id: id,
      player_id: playerId,
      current_step: startStep,
      win_pct: 0,
      total_sessions: 0,
    });

    if (error) {
      setMessage({ type: "error", text: `Failed to add member: ${error.message}` });
    } else {
      setMessage({ type: "success", text: "Member added successfully." });
      setShowAddPlayer(false);
      setSearchQuery("");
      await fetchData();
    }
  };

  const addMembersInBulk = async () => {
    if (bulkSelected.size === 0) return;
    setBulkAdding(true);
    const startStep = preferences?.new_player_start_step ?? 5;

    const rows = Array.from(bulkSelected).map((playerId) => ({
      group_id: id,
      player_id: playerId,
      current_step: startStep,
      win_pct: 0,
      total_sessions: 0,
    }));

    const { error } = await supabase.from("group_memberships").insert(rows);

    if (error) {
      setMessage({ type: "error", text: `Failed to add members: ${error.message}` });
    } else {
      setMessage({ type: "success", text: `${bulkSelected.size} member${bulkSelected.size > 1 ? "s" : ""} added.` });
      setBulkSelected(new Set());
      setBulkMode(false);
      setSearchQuery("");
      await fetchData();
    }
    setBulkAdding(false);
  };

  const updateStep = async (playerId: string, newStep: number) => {
    if (newStep < 1) return;
    const { error } = await supabase
      .from("group_memberships")
      .update({ current_step: newStep })
      .eq("group_id", id)
      .eq("player_id", playerId);

    if (error) {
      setMessage({ type: "error", text: `Failed to update step: ${error.message}` });
    } else {
      setMembers((prev) =>
        prev.map((m) =>
          m.player_id === playerId ? { ...m, current_step: newStep } : m
        )
      );
    }
  };

  const toggleGroupRole = async (playerId: string, currentRole: string) => {
    const newRole = currentRole === "admin" ? "member" : "admin";
    const res = await fetch("/api/admin/group-role", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId, groupId: id, groupRole: newRole }),
    });

    if (!res.ok) {
      const data = await res.json();
      setMessage({ type: "error", text: data.error ?? "Failed to update role" });
    } else {
      setMessage({
        type: "success",
        text: newRole === "admin" ? "Promoted to group admin." : "Demoted to member.",
      });
      await fetchData();
    }
  };

  const updateSignupPriority = async (playerId: string, priority: string) => {
    const { error } = await supabase
      .from("group_memberships")
      .update({ signup_priority: priority })
      .eq("group_id", id)
      .eq("player_id", playerId);

    if (error) {
      setMessage({ type: "error", text: `Failed to update priority: ${error.message}` });
    } else {
      setMembers((prev) =>
        prev.map((m) =>
          m.player_id === playerId ? { ...m, signup_priority: priority as any } : m
        )
      );
    }
  };

  const removeMember = async (playerId: string) => {
    const ok = await confirm({
      title: "Remove member from group?",
      description: "They will lose their ladder step and session history for this group.",
      confirmLabel: "Remove",
      variant: "danger",
    });
    if (!ok) return;

    const { error } = await supabase
      .from("group_memberships")
      .delete()
      .eq("group_id", id)
      .eq("player_id", playerId);

    if (error) {
      setMessage({ type: "error", text: `Failed to remove member: ${error.message}` });
    } else {
      setMessage({ type: "success", text: "Member removed." });
      await fetchData();
    }
  };

  // ============================================================
  // Pending Member Actions
  // ============================================================

  const linkPendingMember = async (pending: PendingMember, playerId: string) => {
    const now = new Date().toISOString();
    const membershipPayload: Record<string, unknown> = {
      group_id: id,
      player_id: playerId,
      current_step: pending.step ?? preferences?.new_player_start_step ?? 5,
      win_pct: pending.win_pct ?? 0,
      total_sessions: pending.total_sessions ?? 0,
    };
    if (pending.last_played_at) membershipPayload.last_played_at = pending.last_played_at;

    const { error: insertErr } = await supabase
      .from("group_memberships")
      .upsert(membershipPayload, { onConflict: "group_id,player_id" });

    if (insertErr) {
      setMessage({ type: "error", text: `Failed to link: ${insertErr.message}` });
      return;
    }

    // Mark pending record as claimed
    await supabase
      .from("pending_group_members")
      .update({ claimed_by: playerId, claimed_at: now })
      .eq("id", pending.id);

    setMessage({ type: "success", text: `${pending.name} linked and added to group.` });
    setLinkingPendingId(null);
    setLinkSearch("");
    await fetchData();
  };

  const deletePendingMember = async (pendingId: string) => {
    const ok = await confirm({
      title: "Remove pending record?",
      description: "This player's imported stats will be discarded.",
      confirmLabel: "Remove",
      variant: "danger",
    });
    if (!ok) return;

    await supabase.from("pending_group_members").delete().eq("id", pendingId);
    setPendingMembers((prev) => prev.filter((p) => p.id !== pendingId));
  };

  // ============================================================
  // Preferences Actions
  // ============================================================

  const savePreferences = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);

    const form = new FormData(e.currentTarget);

    const updates: Partial<GroupPreferences> = {
      pct_window_sessions: Number(form.get("pct_window_sessions")),
      new_player_start_step: Number(form.get("new_player_start_step")),
      min_step: Number(form.get("min_step")),
      max_step: Number(form.get("max_step")),
      step_move_up: Number(form.get("step_move_up")),
      step_move_down: Number(form.get("step_move_down")),
      game_limit_4p: Number(form.get("game_limit_4p")),
      game_limit_5p: Number(form.get("game_limit_5p")),
      win_by_2: form.get("win_by_2") === "on",
    };

    const { error } = await supabase
      .from("group_preferences")
      .update(updates)
      .eq("group_id", id);

    if (error) {
      setMessage({ type: "error", text: `Failed to save: ${error.message}` });
    } else {
      setMessage({ type: "success", text: "Preferences saved." });
      await fetchData();
    }

    setSaving(false);
  };

  // ============================================================
  // Derived data
  // ============================================================

  const memberIds = new Set(members.map((m) => m.player_id));
  const filteredPlayers = allPlayers.filter(
    (p) =>
      !memberIds.has(p.id) &&
      (searchQuery === "" ||
        p.display_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.full_name.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // ============================================================
  // Render
  // ============================================================

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-surface-muted">Loading...</p>
      </div>
    );
  }

  if (!group) {
    return (
      <EmptyState
        title="Group not found"
        description="The group you're looking for doesn't exist or has been removed."
        actionLabel="Back to groups"
        actionHref="/admin/groups"
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-sm">
          <button
            onClick={() => router.push("/admin/groups")}
            className="text-surface-muted hover:text-dark-200"
          >
            Groups
          </button>
          <span className="text-surface-muted">/</span>
        </div>
        <h1 className="mt-1 text-2xl font-bold text-dark-100">{group.name}</h1>
      </div>

      {/* Status Message */}
      {message && (
        <div
          className={cn(
            "rounded-lg px-4 py-3 text-sm",
            message.type === "success"
              ? "bg-teal-900/30 text-teal-300"
              : "bg-red-900/30 text-red-400"
          )}
        >
          {message.text}
        </div>
      )}

      {/* Group Type Badge + City/State */}
      {group && (
        <div className="flex flex-wrap items-center gap-2">
          <span className={group.group_type === "free_play" ? "badge-yellow" : "badge-blue"}>
            {group.group_type === "free_play" ? "Free Play" : "Ladder League"}
          </span>
          {(group.city || group.state) && (
            <span className="text-sm text-surface-muted">
              {[group.city, group.state].filter(Boolean).join(", ")}
            </span>
          )}
        </div>
      )}

      {/* City / State Edit */}
      <div className="card">
        <h3 className="text-sm font-semibold text-dark-100 mb-2">City &amp; State</h3>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            const newCity = (form.get("city") as string)?.trim() || null;
            const newState = (form.get("state") as string)?.trim() || null;
            const { error } = await supabase
              .from("shootout_groups")
              .update({ city: newCity, state: newState })
              .eq("id", id);
            if (error) {
              setMessage({ type: "error", text: `Failed to save: ${error.message}` });
            } else {
              setGroup({ ...group, city: newCity, state: newState });
              setMessage({ type: "success", text: "City & state updated." });
            }
          }}
          className="flex gap-3 items-end"
        >
          <div className="flex-1">
            <label className="block text-xs text-surface-muted mb-1">City</label>
            <input type="text" name="city" defaultValue={group.city ?? ""} className="input w-full" placeholder="e.g. Athens" />
          </div>
          <div className="flex-1">
            <label className="block text-xs text-surface-muted mb-1">State</label>
            <select name="state" defaultValue={group.state ?? ""} className="input w-full">
              <option value="">Select State</option>
              {US_STATES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn-primary whitespace-nowrap">Save</button>
        </form>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-surface-border">
        <button
          onClick={() => setActiveTab("members")}
          className={cn(
            "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
            activeTab === "members"
              ? "border-brand-600 text-brand-600"
              : "border-transparent text-surface-muted hover:text-dark-200"
          )}
        >
          Members ({members.length})
        </button>
        {group?.group_type !== "free_play" && (
          <button
            onClick={() => setActiveTab("preferences")}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              activeTab === "preferences"
                ? "border-brand-600 text-brand-600"
                : "border-transparent text-surface-muted hover:text-dark-200"
            )}
          >
            Preferences
          </button>
        )}
      </div>

      {/* Members Tab */}
      {activeTab === "members" && (
        <div className="space-y-4">
          {/* Add Member */}
          <div>
            <div className="flex flex-wrap gap-2 mb-3">
              <button
                onClick={() => {
                  setShowAddPlayer(!showAddPlayer);
                  if (bulkMode) setBulkMode(false);
                }}
                className="btn-primary"
              >
                {showAddPlayer ? "Cancel" : "Add Member"}
              </button>
              <button
                onClick={() => {
                  setBulkMode(!bulkMode);
                  if (showAddPlayer) setShowAddPlayer(false);
                  setBulkSelected(new Set());
                  setSearchQuery("");
                }}
                className="btn-secondary"
              >
                {bulkMode ? "Cancel Bulk Add" : "Bulk Add"}
              </button>
              <a
                href={`/admin/groups/${id}/import-steps`}
                className="btn-secondary flex items-center gap-2 text-sm"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
                Import Steps
              </a>
            </div>

            {/* Single-add panel */}
            {showAddPlayer && (
              <div className="mt-3 card">
                <input
                  type="text"
                  placeholder="Search players by name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="input mb-3 w-full"
                />
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {filteredPlayers.length > 0 ? (
                    filteredPlayers.slice(0, 20).map((player) => (
                      <div
                        key={player.id}
                        className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-surface-overlay"
                      >
                        <div className="flex items-center gap-3">
                          {player.avatar_url ? (
                            <img
                              src={player.avatar_url}
                              alt=""
                              className="h-8 w-8 rounded-full object-cover"
                            />
                          ) : (
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-overlay text-xs font-medium text-surface-muted">
                              {player.display_name.charAt(0)}
                            </div>
                          )}
                          <div>
                            <p className="text-sm font-medium text-dark-100">
                              {player.display_name}
                            </p>
                            <p className="text-xs text-surface-muted">
                              {player.email}
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => addMember(player.id)}
                          className="btn-secondary text-xs"
                        >
                          Add
                        </button>
                      </div>
                    ))
                  ) : (
                    <p className="py-2 text-center text-sm text-surface-muted">
                      {searchQuery
                        ? "No matching players found."
                        : "All active players are already members."}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Bulk-add panel */}
            {bulkMode && (
              <div className="mt-3 card space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-dark-100">
                    Select players to add
                  </p>
                  {bulkSelected.size > 0 && (
                    <button
                      onClick={addMembersInBulk}
                      disabled={bulkAdding}
                      className="btn-primary text-sm"
                    >
                      {bulkAdding
                        ? "Adding..."
                        : `Add ${bulkSelected.size} Player${bulkSelected.size > 1 ? "s" : ""}`}
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  placeholder="Search players by name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="input w-full"
                />
                <div className="max-h-64 overflow-y-auto space-y-1">
                  {filteredPlayers.length > 0 ? (
                    filteredPlayers.map((player) => {
                      const checked = bulkSelected.has(player.id);
                      return (
                        <label
                          key={player.id}
                          className={cn(
                            "flex items-center gap-3 rounded-lg px-3 py-2 cursor-pointer transition-colors",
                            checked ? "bg-brand-900/20" : "hover:bg-surface-overlay"
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              setBulkSelected((prev) => {
                                const next = new Set(prev);
                                if (next.has(player.id)) next.delete(player.id);
                                else next.add(player.id);
                                return next;
                              });
                            }}
                            className="h-4 w-4 rounded border-surface-border text-brand-600 focus:ring-brand-500 shrink-0"
                          />
                          {player.avatar_url ? (
                            <img
                              src={player.avatar_url}
                              alt=""
                              className="h-8 w-8 rounded-full object-cover shrink-0"
                            />
                          ) : (
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-overlay text-xs font-medium text-surface-muted shrink-0">
                              {player.display_name.charAt(0)}
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-dark-100 truncate">
                              {player.display_name}
                            </p>
                            <p className="text-xs text-surface-muted truncate">
                              {player.email}
                            </p>
                          </div>
                        </label>
                      );
                    })
                  ) : (
                    <p className="py-2 text-center text-sm text-surface-muted">
                      {searchQuery
                        ? "No matching players found."
                        : "All active players are already members."}
                    </p>
                  )}
                </div>
                {bulkSelected.size > 0 && (
                  <div className="flex justify-end pt-1 border-t border-surface-border">
                    <button
                      onClick={addMembersInBulk}
                      disabled={bulkAdding}
                      className="btn-primary text-sm"
                    >
                      {bulkAdding
                        ? "Adding..."
                        : `Add ${bulkSelected.size} Player${bulkSelected.size > 1 ? "s" : ""}`}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Members List — single compact table for all screen sizes */}
          <div className="card overflow-x-auto p-0">
            <table className="min-w-full divide-y divide-surface-border text-sm">
              <thead className="bg-surface-overlay">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-surface-muted">Player</th>
                  {group?.group_type !== "free_play" && (
                    <>
                      <th className="px-3 py-2 text-center text-xs font-medium uppercase tracking-wider text-surface-muted">Step</th>
                      <th className="px-3 py-2 text-center text-xs font-medium uppercase tracking-wider text-surface-muted">Pt %</th>
                    </>
                  )}
                  <th className="px-3 py-2 text-center text-xs font-medium uppercase tracking-wider text-surface-muted">Priority</th>
                  <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wider text-surface-muted">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border bg-surface-raised">
                {members.map((member) => (
                  <tr key={member.player_id} className="hover:bg-surface-overlay/40">
                    {/* Name + email */}
                    <td className="px-3 py-2 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        {member.player?.avatar_url ? (
                          <img src={member.player.avatar_url} alt="" className="h-7 w-7 rounded-full object-cover shrink-0" />
                        ) : (
                          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-overlay text-xs font-medium text-surface-muted shrink-0">
                            {member.player?.display_name?.charAt(0) ?? "?"}
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-dark-100 truncate max-w-[140px]">
                            {member.player?.display_name}
                            {(member as any).group_role === "admin" && (
                              <span className="ml-1.5 inline-flex items-center rounded-full bg-yellow-900/30 px-1.5 py-0.5 text-[10px] font-medium text-yellow-400">A</span>
                            )}
                          </p>
                          <p className="text-[10px] text-surface-muted truncate max-w-[140px]">{member.player?.email}</p>
                        </div>
                      </div>
                    </td>

                    {/* Step (editable) */}
                    {group?.group_type !== "free_play" && (
                      <>
                        <td className="px-3 py-2 text-center whitespace-nowrap">
                          <input
                            type="number"
                            min={1}
                            value={member.current_step}
                            onChange={(e) => {
                              const val = parseInt(e.target.value, 10);
                              if (!isNaN(val)) setMembers((prev) => prev.map((m) => m.player_id === member.player_id ? { ...m, current_step: val } : m));
                            }}
                            onBlur={(e) => {
                              const val = parseInt(e.target.value, 10);
                              if (!isNaN(val) && val >= 1) updateStep(member.player_id, val);
                            }}
                            className="w-14 rounded border border-surface-border bg-surface-raised text-dark-100 px-1.5 py-1 text-center text-xs font-semibold focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                          />
                        </td>
                        <td className="px-3 py-2 text-center whitespace-nowrap text-xs text-dark-200">
                          {member.win_pct}%
                        </td>
                      </>
                    )}

                    {/* Signup Priority */}
                    <td className="px-3 py-2 text-center whitespace-nowrap">
                      <select
                        value={(member as any).signup_priority ?? "normal"}
                        onChange={(e) => updateSignupPriority(member.player_id, e.target.value)}
                        className="rounded border border-surface-border bg-surface-raised text-dark-100 px-1.5 py-1 text-xs focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                      >
                        <option value="high">High</option>
                        <option value="normal">Normal</option>
                        <option value="low">Low</option>
                      </select>
                    </td>

                    {/* Actions */}
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-3">
                        <button
                          onClick={() => toggleGroupRole(member.player_id, (member as any).group_role ?? "member")}
                          className={cn(
                            "text-xs",
                            (member as any).group_role === "admin"
                              ? "text-yellow-400 hover:text-yellow-500"
                              : "text-brand-500 hover:text-brand-400"
                          )}
                        >
                          {(member as any).group_role === "admin" ? "Demote" : "Promote"}
                        </button>
                        <button
                          onClick={() => removeMember(member.player_id)}
                          className="text-xs text-red-400 hover:text-red-500"
                        >
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {members.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-sm text-surface-muted">
                      No members yet. Add players above.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pending Members */}
          {pendingMembers.length > 0 && (
            <div className="card border border-amber-900/40 space-y-3">
              <div>
                <h3 className="text-sm font-semibold text-dark-100">
                  Pending Members ({pendingMembers.length})
                </h3>
                <p className="text-xs text-surface-muted mt-0.5">
                  These players were imported but haven't created an account yet. They'll be auto-added
                  when they sign up. Use "Link" if they signed up with a different name.
                </p>
              </div>
              <div className="overflow-x-auto rounded border border-surface-border">
                <table className="text-xs w-full min-w-max">
                  <thead>
                    <tr className="border-b border-surface-border bg-surface-overlay">
                      <th className="text-left px-3 py-2 text-dark-200 font-medium">Name (from CSV)</th>
                      {group?.group_type !== "free_play" && (
                        <>
                          <th className="text-right px-3 py-2 text-dark-200 font-medium">Step</th>
                          <th className="text-right px-3 py-2 text-dark-200 font-medium">Win %</th>
                        </>
                      )}
                      <th className="text-right px-3 py-2 text-dark-200 font-medium">Last Played</th>
                      <th className="text-right px-3 py-2 text-dark-200 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingMembers.map((pending) => (
                      <tr key={pending.id} className="border-b border-surface-border/50 last:border-0">
                        <td className="px-3 py-2 text-dark-100">
                          <div>{pending.name}</div>
                          {pending.invite_email && (
                            <div className="text-surface-muted">{pending.invite_email}</div>
                          )}
                        </td>
                        {group?.group_type !== "free_play" && (
                          <>
                            <td className="px-3 py-2 text-right text-dark-200">
                              {pending.step ?? <span className="text-surface-muted">—</span>}
                            </td>
                            <td className="px-3 py-2 text-right text-dark-200">
                              {pending.win_pct != null ? `${pending.win_pct}%` : <span className="text-surface-muted">—</span>}
                            </td>
                          </>
                        )}
                        <td className="px-3 py-2 text-right text-dark-200">
                          {pending.last_played_at
                            ? formatDate(pending.last_played_at)
                            : <span className="text-surface-muted">—</span>}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {linkingPendingId === pending.id ? (
                            <div className="flex items-center gap-2 justify-end">
                              <div className="relative">
                                <input
                                  type="text"
                                  placeholder="Search player..."
                                  value={linkSearch}
                                  onChange={(e) => setLinkSearch(e.target.value)}
                                  className="input text-xs w-40"
                                  autoFocus
                                />
                                {linkSearch.length > 0 && (
                                  <div className="absolute right-0 top-full mt-1 w-56 bg-surface-raised border border-surface-border rounded-lg shadow-xl z-20 max-h-48 overflow-y-auto">
                                    {allPlayers
                                      .filter((p) =>
                                        !members.some((m) => m.player_id === p.id) &&
                                        (p.display_name.toLowerCase().includes(linkSearch.toLowerCase()) ||
                                         p.full_name.toLowerCase().includes(linkSearch.toLowerCase()))
                                      )
                                      .slice(0, 10)
                                      .map((p) => (
                                        <button
                                          key={p.id}
                                          onClick={() => linkPendingMember(pending, p.id)}
                                          className="w-full text-left px-3 py-2 text-xs hover:bg-surface-overlay"
                                        >
                                          <div className="font-medium text-dark-100">{p.display_name}</div>
                                          <div className="text-surface-muted">{p.email}</div>
                                        </button>
                                      ))}
                                    {allPlayers.filter((p) =>
                                      !members.some((m) => m.player_id === p.id) &&
                                      (p.display_name.toLowerCase().includes(linkSearch.toLowerCase()) ||
                                       p.full_name.toLowerCase().includes(linkSearch.toLowerCase()))
                                    ).length === 0 && (
                                      <p className="px-3 py-2 text-surface-muted">No match found</p>
                                    )}
                                  </div>
                                )}
                              </div>
                              <button
                                onClick={() => { setLinkingPendingId(null); setLinkSearch(""); }}
                                className="text-surface-muted hover:text-dark-200"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-3 justify-end">
                              <button
                                onClick={() => setLinkingPendingId(pending.id)}
                                className="text-brand-400 hover:text-brand-300"
                              >
                                Link
                              </button>
                              <button
                                onClick={() => deletePendingMember(pending.id)}
                                className="text-red-400 hover:text-red-300"
                              >
                                Remove
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>
      )}

      {/* Preferences Tab */}
      {activeTab === "preferences" && preferences && (
        <form onSubmit={savePreferences} className="card space-y-6">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-dark-200">
                Pt % Window (sessions)
              </label>
              <input
                type="number"
                name="pct_window_sessions"
                defaultValue={preferences.pct_window_sessions}
                min={1}
                className="input mt-1 w-full"
              />
              <p className="mt-1 text-xs text-surface-muted">
                Number of recent sessions used to calculate point percentage.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-dark-200">
                New Player Start Step
              </label>
              <input
                type="number"
                name="new_player_start_step"
                defaultValue={preferences.new_player_start_step}
                min={1}
                className="input mt-1 w-full"
              />
              <p className="mt-1 text-xs text-surface-muted">
                Step assigned to players when they first join the group.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-dark-200">
                Highest Step
              </label>
              <input
                type="number"
                name="min_step"
                defaultValue={preferences.min_step}
                min={1}
                className="input mt-1 w-full"
              />
              <p className="mt-1 text-xs text-surface-muted">
                The best position on the ladder (1 = top).
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-dark-200">
                Lowest Step
              </label>
              <input
                type="number"
                name="max_step"
                defaultValue={preferences.max_step}
                min={1}
                className="input mt-1 w-full"
              />
              <p className="mt-1 text-xs text-surface-muted">
                The lowest number step a player can drop to.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-dark-200">
                Step Move Up
              </label>
              <input
                type="number"
                name="step_move_up"
                defaultValue={preferences.step_move_up}
                min={1}
                className="input mt-1 w-full"
              />
              <p className="mt-1 text-xs text-surface-muted">
                Steps gained by finishing 1st in a pool.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-dark-200">
                Step Move Down
              </label>
              <input
                type="number"
                name="step_move_down"
                defaultValue={preferences.step_move_down}
                min={1}
                className="input mt-1 w-full"
              />
              <p className="mt-1 text-xs text-surface-muted">
                Steps lost by finishing last in a pool.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-dark-200">
                Four Player Score Limit
              </label>
              <input
                type="number"
                name="game_limit_4p"
                defaultValue={preferences.game_limit_4p}
                min={1}
                className="input mt-1 w-full"
              />
              <p className="mt-1 text-xs text-surface-muted">
                Games to {preferences.game_limit_4p} in a 4-player pool.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-dark-200">
                Five Player Score Limit
              </label>
              <input
                type="number"
                name="game_limit_5p"
                defaultValue={preferences.game_limit_5p}
                min={1}
                className="input mt-1 w-full"
              />
              <p className="mt-1 text-xs text-surface-muted">
                Games to {preferences.game_limit_5p} in a 5-player pool.
              </p>
            </div>

            <div className="flex items-center gap-3 sm:col-span-2">
              <input
                type="checkbox"
                name="win_by_2"
                id="win_by_2"
                defaultChecked={preferences.win_by_2}
                className="h-4 w-4 rounded border-surface-border text-brand-600 focus:ring-brand-500"
              />
              <label htmlFor="win_by_2" className="text-sm font-medium text-dark-200">
                Win by 2 required
              </label>
            </div>
          </div>

          <div className="flex justify-end">
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? "Saving..." : "Save Preferences"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
