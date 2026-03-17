"use client";

import { useSupabase } from "@/components/providers/supabase-provider";
import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
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

type Tab = "members" | "preferences";

// ============================================================
// Page Component
// ============================================================

export default function AdminGroupDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { supabase } = useSupabase();
  const router = useRouter();

  const [group, setGroup] = useState<ShootoutGroup | null>(null);
  const [preferences, setPreferences] = useState<GroupPreferences | null>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [allPlayers, setAllPlayers] = useState<Profile[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>("members");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Search state for adding members
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddPlayer, setShowAddPlayer] = useState(false);

  // ============================================================
  // Data Fetching
  // ============================================================

  const fetchData = useCallback(async () => {
    setLoading(true);

    const [groupRes, prefsRes, membersRes, playersRes] = await Promise.all([
      supabase.from("shootout_groups").select("*").eq("id", id).single(),
      supabase.from("group_preferences").select("*").eq("group_id", id).single(),
      supabase
        .from("group_memberships")
        .select(
          "*, player:profiles!group_memberships_player_id_fkey(id, full_name, display_name, avatar_url, email)"
        )
        .eq("group_id", id)
        .order("current_step", { ascending: true }),
      supabase
        .from("profiles")
        .select("*")
        .eq("is_active", true)
        .order("display_name", { ascending: true }),
    ]);

    if (groupRes.data) setGroup(groupRes.data);
    if (prefsRes.data) setPreferences(prefsRes.data);
    if (membersRes.data) setMembers(membersRes.data as MemberRow[]);
    if (playersRes.data) setAllPlayers(playersRes.data);

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

  const removeMember = async (playerId: string) => {
    if (!confirm("Are you sure you want to remove this member?")) return;

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
      <div className="card text-center text-surface-muted">
        Group not found.
      </div>
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
            <button
              onClick={() => setShowAddPlayer(!showAddPlayer)}
              className="btn-primary"
            >
              {showAddPlayer ? "Cancel" : "Add Member"}
            </button>

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
          </div>

          {/* Members List */}

          {/* Mobile: card list */}
          <div className="space-y-2 sm:hidden">
            {members.map((member) => (
              <div key={member.player_id} className="card space-y-3">
                <div className="flex items-center gap-3">
                  {member.player?.avatar_url ? (
                    <img
                      src={member.player.avatar_url}
                      alt=""
                      className="h-8 w-8 rounded-full object-cover shrink-0"
                    />
                  ) : (
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-overlay text-xs font-medium text-surface-muted shrink-0">
                      {member.player?.display_name?.charAt(0) ?? "?"}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-dark-100 truncate">
                      {member.player?.display_name}
                      {(member as any).group_role === "admin" && (
                        <span className="ml-2 inline-flex items-center rounded-full bg-yellow-900/30 px-2 py-0.5 text-xs font-medium text-yellow-400">
                          Admin
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-surface-muted truncate">
                      {member.player?.email}
                    </p>
                  </div>
                </div>
                {group?.group_type !== "free_play" && (
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 text-sm text-dark-200">
                      <span className="text-surface-muted font-medium">Step</span>
                      <input
                        type="number"
                        min={1}
                        value={member.current_step}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10);
                          if (!isNaN(val)) {
                            setMembers((prev) =>
                              prev.map((m) =>
                                m.player_id === member.player_id
                                  ? { ...m, current_step: val }
                                  : m
                              )
                            );
                          }
                        }}
                        onBlur={(e) => {
                          const val = parseInt(e.target.value, 10);
                          if (!isNaN(val) && val >= 1) {
                            updateStep(member.player_id, val);
                          }
                        }}
                        className="w-16 rounded border border-surface-border bg-surface-raised text-dark-100 px-2 py-1 text-center text-sm font-semibold focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                      />
                    </label>
                    <span className="text-sm font-semibold text-brand-400">{member.win_pct}% Win</span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-surface-muted">Joined {formatDate(member.joined_at)}</span>
                  <div className="flex items-center gap-3">
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
                </div>
              </div>
            ))}
            {members.length === 0 && (
              <div className="card py-8 text-center text-sm text-surface-muted">
                No members yet. Add players above.
              </div>
            )}
          </div>

          {/* Desktop: table */}
          <div className="card overflow-hidden p-0 hidden sm:block">
            <table className="min-w-full divide-y divide-surface-border">
              <thead className="bg-surface-overlay">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-surface-muted">
                    Player
                  </th>
                  {group?.group_type !== "free_play" && (
                    <>
                      <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-surface-muted">
                        Step
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-surface-muted">
                        Win %
                      </th>
                    </>
                  )}
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-surface-muted">
                    Joined
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-surface-muted">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border bg-surface-raised">
                {members.map((member) => (
                  <tr key={member.player_id}>
                    <td className="whitespace-nowrap px-4 py-3">
                      <div className="flex items-center gap-3">
                        {member.player?.avatar_url ? (
                          <img
                            src={member.player.avatar_url}
                            alt=""
                            className="h-8 w-8 rounded-full object-cover"
                          />
                        ) : (
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-overlay text-xs font-medium text-surface-muted">
                            {member.player?.display_name?.charAt(0) ?? "?"}
                          </div>
                        )}
                        <div>
                          <p className="text-sm font-medium text-dark-100">
                            {member.player?.display_name}
                            {(member as any).group_role === "admin" && (
                              <span className="ml-2 inline-flex items-center rounded-full bg-yellow-900/30 px-2 py-0.5 text-xs font-medium text-yellow-400">
                                Admin
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-surface-muted">
                            {member.player?.email}
                          </p>
                        </div>
                      </div>
                    </td>
                    {group?.group_type !== "free_play" && (
                      <>
                        <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-dark-100">
                          <input
                            type="number"
                            min={1}
                            value={member.current_step}
                            onChange={(e) => {
                              const val = parseInt(e.target.value, 10);
                              if (!isNaN(val)) {
                                setMembers((prev) =>
                                  prev.map((m) =>
                                    m.player_id === member.player_id
                                      ? { ...m, current_step: val }
                                      : m
                                  )
                                );
                              }
                            }}
                            onBlur={(e) => {
                              const val = parseInt(e.target.value, 10);
                              if (!isNaN(val) && val >= 1) {
                                updateStep(member.player_id, val);
                              }
                            }}
                            className="w-16 rounded border border-surface-border bg-surface-raised text-dark-100 px-2 py-1 text-right text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                          />
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-dark-100">
                          {member.win_pct}%
                        </td>
                      </>
                    )}
                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-surface-muted">
                      {formatDate(member.joined_at)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <button
                          onClick={() => toggleGroupRole(member.player_id, (member as any).group_role ?? "member")}
                          className={cn(
                            "text-sm",
                            (member as any).group_role === "admin"
                              ? "text-yellow-400 hover:text-yellow-500"
                              : "text-brand-500 hover:text-brand-400"
                          )}
                        >
                          {(member as any).group_role === "admin" ? "Demote" : "Promote"}
                        </button>
                        <button
                          onClick={() => removeMember(member.player_id)}
                          className="text-sm text-red-400 hover:text-red-500"
                        >
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {members.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-8 text-center text-sm text-surface-muted"
                    >
                      No members yet. Add players above.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Preferences Tab */}
      {activeTab === "preferences" && preferences && (
        <form onSubmit={savePreferences} className="card space-y-6">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-dark-200">
                Win % Window (sessions)
              </label>
              <input
                type="number"
                name="pct_window_sessions"
                defaultValue={preferences.pct_window_sessions}
                min={1}
                className="input mt-1 w-full"
              />
              <p className="mt-1 text-xs text-surface-muted">
                Number of recent sessions used to calculate win percentage.
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
