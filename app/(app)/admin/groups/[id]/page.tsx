"use client";

import { useSupabase } from "@/components/providers/supabase-provider";
import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import type {
  ShootoutGroup,
  GroupPreferences,
  GroupMembership,
  Profile,
} from "@/types/database";

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
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  if (!group) {
    return (
      <div className="card text-center text-gray-500">
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
            className="text-gray-500 hover:text-gray-700"
          >
            Groups
          </button>
          <span className="text-gray-400">/</span>
        </div>
        <h1 className="mt-1 text-2xl font-bold text-gray-900">{group.name}</h1>
      </div>

      {/* Status Message */}
      {message && (
        <div
          className={cn(
            "rounded-lg px-4 py-3 text-sm",
            message.type === "success"
              ? "bg-green-50 text-green-700"
              : "bg-red-50 text-red-700"
          )}
        >
          {message.text}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        <button
          onClick={() => setActiveTab("members")}
          className={cn(
            "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
            activeTab === "members"
              ? "border-brand-600 text-brand-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          )}
        >
          Members ({members.length})
        </button>
        <button
          onClick={() => setActiveTab("preferences")}
          className={cn(
            "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
            activeTab === "preferences"
              ? "border-brand-600 text-brand-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          )}
        >
          Preferences
        </button>
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
                        className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-gray-50"
                      >
                        <div className="flex items-center gap-3">
                          {player.avatar_url ? (
                            <img
                              src={player.avatar_url}
                              alt=""
                              className="h-8 w-8 rounded-full object-cover"
                            />
                          ) : (
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-200 text-xs font-medium text-gray-600">
                              {player.display_name.charAt(0)}
                            </div>
                          )}
                          <div>
                            <p className="text-sm font-medium text-gray-900">
                              {player.display_name}
                            </p>
                            <p className="text-xs text-gray-500">
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
                    <p className="py-2 text-center text-sm text-gray-500">
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
          <div className="card overflow-hidden p-0">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Player
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                    Step
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                    Win %
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                    Joined
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
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
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-200 text-xs font-medium text-gray-600">
                            {member.player?.display_name?.charAt(0) ?? "?"}
                          </div>
                        )}
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            {member.player?.display_name}
                          </p>
                          <p className="text-xs text-gray-500">
                            {member.player?.email}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-gray-900">
                      {member.current_step}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-gray-900">
                      {member.win_pct}%
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-gray-500">
                      {new Date(member.joined_at).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <button
                        onClick={() => removeMember(member.player_id)}
                        className="text-sm text-red-600 hover:text-red-500"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
                {members.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-8 text-center text-sm text-gray-500"
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
              <label className="block text-sm font-medium text-gray-700">
                Win % Window (sessions)
              </label>
              <input
                type="number"
                name="pct_window_sessions"
                defaultValue={preferences.pct_window_sessions}
                min={1}
                className="input mt-1 w-full"
              />
              <p className="mt-1 text-xs text-gray-500">
                Number of recent sessions used to calculate win percentage.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                New Player Start Step
              </label>
              <input
                type="number"
                name="new_player_start_step"
                defaultValue={preferences.new_player_start_step}
                min={1}
                className="input mt-1 w-full"
              />
              <p className="mt-1 text-xs text-gray-500">
                Step assigned to players when they first join the group.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Minimum Step
              </label>
              <input
                type="number"
                name="min_step"
                defaultValue={preferences.min_step}
                min={1}
                className="input mt-1 w-full"
              />
              <p className="mt-1 text-xs text-gray-500">
                Lowest step a player can reach (1 = top of ladder).
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Step Move Up
              </label>
              <input
                type="number"
                name="step_move_up"
                defaultValue={preferences.step_move_up}
                min={1}
                className="input mt-1 w-full"
              />
              <p className="mt-1 text-xs text-gray-500">
                Steps gained by finishing 1st in a pool.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Step Move Down
              </label>
              <input
                type="number"
                name="step_move_down"
                defaultValue={preferences.step_move_down}
                min={1}
                className="input mt-1 w-full"
              />
              <p className="mt-1 text-xs text-gray-500">
                Steps lost by finishing last in a pool.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Four Player Score Limit
              </label>
              <input
                type="number"
                name="game_limit_4p"
                defaultValue={preferences.game_limit_4p}
                min={1}
                className="input mt-1 w-full"
              />
              <p className="mt-1 text-xs text-gray-500">
                Games to {preferences.game_limit_4p} in a 4-player pool.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Five Player Score Limit
              </label>
              <input
                type="number"
                name="game_limit_5p"
                defaultValue={preferences.game_limit_5p}
                min={1}
                className="input mt-1 w-full"
              />
              <p className="mt-1 text-xs text-gray-500">
                Games to {preferences.game_limit_5p} in a 5-player pool.
              </p>
            </div>

            <div className="flex items-center gap-3 sm:col-span-2">
              <input
                type="checkbox"
                name="win_by_2"
                id="win_by_2"
                defaultChecked={preferences.win_by_2}
                className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
              />
              <label htmlFor="win_by_2" className="text-sm font-medium text-gray-700">
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
