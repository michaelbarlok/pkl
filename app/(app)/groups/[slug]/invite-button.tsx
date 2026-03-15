"use client";

import { useSupabase } from "@/components/providers/supabase-provider";
import { useState } from "react";
import { useRouter } from "next/navigation";

interface Player {
  id: string;
  display_name: string;
  avatar_url: string | null;
}

export function InviteButton({
  groupId,
  groupType,
}: {
  groupId: string;
  groupType: string;
}) {
  const { supabase } = useSupabase();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Player[]>([]);
  const [searching, setSearching] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const search = async (q: string) => {
    setQuery(q);
    if (q.length < 2) {
      setResults([]);
      return;
    }

    setSearching(true);

    // Get current members to exclude
    const { data: members } = await supabase
      .from("group_memberships")
      .select("player_id")
      .eq("group_id", groupId);
    const memberIds = new Set(members?.map((m) => m.player_id) ?? []);

    // Search players
    const { data: players } = await supabase
      .from("profiles")
      .select("id, display_name, avatar_url")
      .eq("is_active", true)
      .ilike("display_name", `%${q}%`)
      .limit(10);

    setResults(
      (players ?? []).filter((p) => !memberIds.has(p.id))
    );
    setSearching(false);
  };

  const invite = async (playerId: string) => {
    // Get start step from preferences
    let startStep = 5;
    if (groupType === "ladder_league") {
      const { data: prefs } = await supabase
        .from("group_preferences")
        .select("new_player_start_step")
        .eq("group_id", groupId)
        .single();
      startStep = prefs?.new_player_start_step ?? 5;
    }

    const { error } = await supabase.from("group_memberships").insert({
      group_id: groupId,
      player_id: playerId,
      current_step: startStep,
      win_pct: 0,
      total_sessions: 0,
    });

    if (error) {
      setMessage("Failed to add member.");
    } else {
      setMessage("Member added!");
      setQuery("");
      setResults([]);
      router.refresh();
    }

    setTimeout(() => setMessage(null), 3000);
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="btn-secondary">
        Invite Member
      </button>
    );
  }

  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        <input
          type="text"
          placeholder="Search by name..."
          value={query}
          onChange={(e) => search(e.target.value)}
          className="input w-48"
          autoFocus
        />
        <button
          onClick={() => {
            setOpen(false);
            setQuery("");
            setResults([]);
          }}
          className="text-sm text-surface-muted hover:text-dark-200"
        >
          Cancel
        </button>
      </div>

      {message && (
        <p className="mt-1 text-xs text-teal-300">{message}</p>
      )}

      {results.length > 0 && (
        <div className="absolute top-full left-0 z-20 mt-1 w-64 rounded-lg border border-surface-border bg-surface-raised shadow-lg">
          <div className="max-h-48 overflow-y-auto p-1">
            {results.map((player) => (
              <button
                key={player.id}
                onClick={() => invite(player.id)}
                className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left hover:bg-surface-overlay"
              >
                {player.avatar_url ? (
                  <img
                    src={player.avatar_url}
                    alt=""
                    className="h-6 w-6 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-surface-overlay text-xs font-medium text-surface-muted">
                    {player.display_name.charAt(0)}
                  </div>
                )}
                <span className="text-sm text-dark-100">
                  {player.display_name}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {searching && (
        <p className="mt-1 text-xs text-surface-muted">Searching...</p>
      )}

      {query.length >= 2 && !searching && results.length === 0 && (
        <p className="mt-1 text-xs text-surface-muted">No players found.</p>
      )}
    </div>
  );
}
