"use client";

import { useSupabase } from "@/components/providers/supabase-provider";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface CoOrganizerManagerProps {
  tournamentId: string;
  coOrganizers: { profile_id: string; profile?: { id: string; display_name: string } }[];
  creatorId: string;
  /**
   * When true, render without the outer `.card` wrapper so the
   * component can be embedded inside another card (e.g. the
   * collapsible tournament-details card). Defaults to false for
   * backward compat with standalone usage.
   */
  embedded?: boolean;
}

export function CoOrganizerManager({
  tournamentId,
  coOrganizers,
  creatorId,
  embedded = false,
}: CoOrganizerManagerProps) {
  const { supabase } = useSupabase();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<{ id: string; display_name: string }[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);

  // Search for members to add as co-organizers
  useEffect(() => {
    if (search.trim().length < 2) {
      setResults([]);
      return;
    }

    const timeout = setTimeout(async () => {
      setSearching(true);
      const q = search.trim().toLowerCase();
      const { data } = await supabase
        .from("profiles")
        .select("id, display_name")
        .or(`display_name.ilike.%${q}%,full_name.ilike.%${q}%`)
        .eq("is_active", true)
        .limit(8);

      if (data) {
        // Filter out the creator and existing co-organizers
        const existingIds = new Set([creatorId, ...coOrganizers.map((o) => o.profile_id)]);
        setResults(data.filter((p) => !existingIds.has(p.id)));
      }
      setSearching(false);
    }, 300);

    return () => clearTimeout(timeout);
  }, [search, supabase, creatorId, coOrganizers]);

  async function addOrganizer(profileId: string) {
    setSaving(profileId);
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/organizers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Failed to add co-organizer.");
        return;
      }
      setSearch("");
      setResults([]);
      router.refresh();
    } catch {
      alert("Failed to add co-organizer.");
    } finally {
      setSaving(null);
    }
  }

  async function removeOrganizer(profileId: string) {
    if (!confirm("Remove this co-organizer?")) return;
    setSaving(profileId);
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/organizers`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Failed to remove co-organizer.");
        return;
      }
      router.refresh();
    } catch {
      alert("Failed to remove co-organizer.");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className={embedded ? "" : "card"}>
      <h2 className="text-sm font-semibold text-dark-200 mb-3">Co-Organizers</h2>

      {/* Current co-organizers */}
      {coOrganizers.length > 0 ? (
        <div className="space-y-2 mb-3">
          {coOrganizers.map((o) => (
            <div key={o.profile_id} className="flex items-center justify-between">
              <span className="text-sm text-dark-100">
                {o.profile?.display_name ?? "Unknown"}
              </span>
              <button
                type="button"
                onClick={() => removeOrganizer(o.profile_id)}
                disabled={saving === o.profile_id}
                className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50"
              >
                {saving === o.profile_id ? "..." : "Remove"}
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-surface-muted mb-3">No co-organizers yet.</p>
      )}

      {/* Search to add */}
      <div className="relative">
        <input
          type="text"
          placeholder="Search members to add..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input w-full text-sm"
        />
        {results.length > 0 && (
          <div className="absolute z-10 mt-1 w-full rounded-md bg-surface-raised border border-surface-border shadow-lg max-h-48 overflow-y-auto">
            {results.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => addOrganizer(p.id)}
                disabled={saving === p.id}
                className="w-full text-left px-3 py-2 text-sm text-dark-100 hover:bg-surface-overlay disabled:opacity-50"
              >
                {saving === p.id ? "Adding..." : p.display_name}
              </button>
            ))}
          </div>
        )}
        {searching && (
          <div className="absolute z-10 mt-1 w-full rounded-md bg-surface-raised border border-surface-border shadow-lg px-3 py-2">
            <span className="text-sm text-surface-muted">Searching...</span>
          </div>
        )}
      </div>
    </div>
  );
}
