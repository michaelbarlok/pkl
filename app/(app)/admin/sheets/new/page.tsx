"use client";

import { EmptyState } from "@/components/empty-state";
import { FormError } from "@/components/form-error";
import { useSupabase } from "@/components/providers/supabase-provider";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { ShootoutGroup } from "@/types/database";

export default function NewSheetPage() {
  const { supabase } = useSupabase();
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedGroupId = searchParams.get("groupId");

  const [groups, setGroups] = useState<ShootoutGroup[]>([]);
  const [savedLocations, setSavedLocations] = useState<{ name: string; cityState: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Form state
  const [groupId, setGroupId] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [eventTime, setEventTime] = useState("09:00");
  const [location, setLocation] = useState("");
  const [playerLimit, setPlayerLimit] = useState(16);
  const [signupCloseHours, setSignupCloseHours] = useState("1");
  const [withdrawCloseHours, setWithdrawCloseHours] = useState("");
  const [allowMemberGuests, setAllowMemberGuests] = useState(false);
  const [notifyOnCreate, setNotifyOnCreate] = useState(true);
  const [notes, setNotes] = useState("");

  // Generate 15-min time options
  const timeOptions: string[] = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 15) {
      const hh = h.toString().padStart(2, "0");
      const mm = m.toString().padStart(2, "0");
      timeOptions.push(`${hh}:${mm}`);
    }
  }

  function formatTime12h(time24: string) {
    const [hStr, mStr] = time24.split(":");
    const h = parseInt(hStr, 10);
    const suffix = h >= 12 ? "pm" : "am";
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${h12}:${mStr} ${suffix}`;
  }

  function computeCloseTime(hoursStr: string): string | null {
    if (!hoursStr || !eventDate || !eventTime) return null;
    const hours = parseInt(hoursStr, 10);
    // Parse time components directly to avoid timezone conversion
    const [hStr, mStr] = eventTime.split(":");
    let h = parseInt(hStr, 10) - hours;
    let m = parseInt(mStr, 10);
    let date = eventDate;
    // Handle day rollback if hours go negative
    while (h < 0) {
      h += 24;
      const d = new Date(date + "T00:00:00Z");
      d.setUTCDate(d.getUTCDate() - 1);
      date = d.toISOString().split("T")[0];
    }
    const hh = h.toString().padStart(2, "0");
    const mm = m.toString().padStart(2, "0");
    // Parse as local time, then convert to UTC ISO string so Supabase stores the correct value
    return new Date(`${date}T${hh}:${mm}:00`).toISOString();
  }

  useEffect(() => {
    async function load() {
      const [groupsRes, sheetsRes, tournamentsRes] = await Promise.all([
        supabase
          .from("shootout_groups")
          .select("*")
          .eq("is_active", true)
          .eq("group_type", "ladder_league")
          .order("name", { ascending: true }),
        supabase
          .from("signup_sheets")
          .select("location, group:shootout_groups(city, state)"),
        supabase
          .from("tournaments")
          .select("location"),
      ]);

      const loadedGroups = groupsRes.data ?? [];
      setGroups(loadedGroups);
      if (loadedGroups.length > 0) {
        // Pre-select the group passed via ?groupId=, if it exists in the list
        const match = preselectedGroupId && loadedGroups.find((g) => g.id === preselectedGroupId);
        setGroupId(match ? match.id : loadedGroups[0].id);
      }

      // Extract unique locations with city/state, sorted alphabetically
      const locMap = new Map<string, string>();
      for (const s of sheetsRes.data ?? []) {
        const loc = (s as any).location?.trim();
        if (!loc) continue;
        if (!locMap.has(loc)) {
          const g = (s as any).group;
          const cs = [g?.city, g?.state].filter(Boolean).join(", ");
          locMap.set(loc, cs);
        }
      }
      for (const t of tournamentsRes.data ?? []) {
        const loc = (t as any).location?.trim();
        if (loc && !locMap.has(loc)) locMap.set(loc, "");
      }
      const locations = Array.from(locMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, cityState]) => ({ name, cityState }));
      setSavedLocations(locations);
      if (locations.length > 0) {
        setLocation(locations[0].name);
      }

      setLoading(false);
    }
    load();
  }, [supabase]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!groupId) {
      setError("Please select a group.");
      return;
    }
    if (!eventDate || !eventTime || !location.trim()) {
      setError("Date, time, and location are required.");
      return;
    }
    if (!signupCloseHours) {
      setError("Sign-up close time is required.");
      return;
    }

    const signupClosesAt = computeCloseTime(signupCloseHours);
    const withdrawClosesAt = computeCloseTime(withdrawCloseHours);

    if (!signupClosesAt) {
      setError("Could not compute sign-up close time. Check date and time.");
      return;
    }

    setSaving(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError("Not authenticated.");
        setSaving(false);
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user.id)
        .single();

      if (!profile) {
        setError("Profile not found.");
        setSaving(false);
        return;
      }

      const { data: sheet, error: insertError } = await supabase
        .from("signup_sheets")
        .insert({
          group_id: groupId,
          event_date: eventDate,
          event_time: `${eventDate}T${eventTime}:00`,
          location: location.trim(),
          player_limit: playerLimit,
          signup_closes_at: signupClosesAt,
          withdraw_closes_at: withdrawClosesAt,
          allow_member_guests: allowMemberGuests,
          notify_on_create: notifyOnCreate,
          notes: notes.trim() || null,
          status: "open",
          created_by: profile.id,
        })
        .select("id")
        .single();

      if (insertError) {
        setError(insertError.message);
        setSaving(false);
        return;
      }

      // Send notifications to group members if enabled
      if (notifyOnCreate) {
        await fetch("/api/sheets/notify-create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sheetId: sheet.id }),
        });
      }

      router.push(`/admin/sheets/${sheet.id}`);
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create sheet.";
      setError(message);
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-surface-muted">Loading...</p>
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <EmptyState
        title="No active groups found"
        description="Create a group first before creating a sign-up sheet."
        actionLabel="Go to Groups"
        actionHref="/admin/groups"
      />
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <button
          onClick={() => router.push("/admin/sheets")}
          className="text-sm text-brand-400 hover:text-brand-300"
        >
          &larr; All Sheets
        </button>
        <h1 className="mt-2 text-2xl font-bold text-dark-100">
          Create Sign-Up Sheet
        </h1>
      </div>

      <FormError message={error} />

      <form onSubmit={handleSubmit} className="card space-y-4">
        <div>
          <label htmlFor="group" className="block text-sm font-medium text-dark-200 mb-1">
            Group
          </label>
          <select
            id="group"
            value={groupId}
            onChange={(e) => setGroupId(e.target.value)}
            className="input w-full"
            required
          >
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="eventDate" className="block text-sm font-medium text-dark-200 mb-1">
              Event Date
            </label>
            <input
              id="eventDate"
              type="date"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              className="input w-full"
              required
            />
          </div>
          <div>
            <label htmlFor="eventTime" className="block text-sm font-medium text-dark-200 mb-1">
              Event Time
            </label>
            <select
              id="eventTime"
              value={eventTime}
              onChange={(e) => setEventTime(e.target.value)}
              className="input w-full"
              required
            >
              {timeOptions.map((t) => (
                <option key={t} value={t}>
                  {formatTime12h(t)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="location" className="block text-sm font-medium text-dark-200 mb-1">
            Location
          </label>
          {savedLocations.length > 0 ? (
            <div className="space-y-2">
              <select
                id="location"
                value={savedLocations.some((l) => l.name === location) ? location : "__custom__"}
                onChange={(e) => {
                  if (e.target.value === "__custom__") {
                    setLocation("");
                  } else {
                    setLocation(e.target.value);
                  }
                }}
                className="input w-full"
              >
                {savedLocations.map((loc) => (
                  <option key={loc.name} value={loc.name}>
                    {loc.name}{loc.cityState ? ` — ${loc.cityState}` : ""}
                  </option>
                ))}
                <option value="__custom__">+ Add new location</option>
              </select>
              {!savedLocations.some((l) => l.name === location) && (
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="input w-full"
                  placeholder="Enter new location name"
                  required
                />
              )}
            </div>
          ) : (
            <input
              id="location"
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="input w-full"
              placeholder="e.g. Athens Community Center"
              required
            />
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="playerLimit" className="block text-sm font-medium text-dark-200 mb-1">
              Player Limit
            </label>
            <input
              id="playerLimit"
              type="number"
              min={4}
              value={playerLimit}
              onChange={(e) => setPlayerLimit(Number(e.target.value))}
              className="input w-full"
              required
            />
          </div>
          <div>
            <label htmlFor="signupClosesAt" className="block text-sm font-medium text-dark-200 mb-1">
              Sign-Up Closes
            </label>
            <select
              id="signupClosesAt"
              value={signupCloseHours}
              onChange={(e) => setSignupCloseHours(e.target.value)}
              className="input w-full"
              required
            >
              <option value="1">1 hour before</option>
              <option value="2">2 hours before</option>
              <option value="3">3 hours before</option>
              <option value="12">12 hours before</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="withdrawClosesAt" className="block text-sm font-medium text-dark-200 mb-1">
              Withdraw Closes
            </label>
            <select
              id="withdrawClosesAt"
              value={withdrawCloseHours}
              onChange={(e) => setWithdrawCloseHours(e.target.value)}
              className="input w-full"
            >
              <option value="">No withdraw deadline</option>
              <option value="1">1 hour before</option>
              <option value="2">2 hours before</option>
              <option value="3">3 hours before</option>
              <option value="12">12 hours before</option>
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="notes" className="block text-sm font-medium text-dark-200 mb-1">
            Notes (optional)
          </label>
          <textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="input w-full"
            rows={2}
            placeholder="Any additional info for players..."
          />
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="allowMemberGuests"
              checked={allowMemberGuests}
              onChange={(e) => setAllowMemberGuests(e.target.checked)}
              className="h-4 w-4 rounded border-surface-border text-brand-600 focus:ring-brand-500"
            />
            <label htmlFor="allowMemberGuests" className="text-sm font-medium text-dark-200">
              Allow members to add other members
            </label>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="notifyOnCreate"
              checked={notifyOnCreate}
              onChange={(e) => setNotifyOnCreate(e.target.checked)}
              className="h-4 w-4 rounded border-surface-border text-brand-600 focus:ring-brand-500"
            />
            <label htmlFor="notifyOnCreate" className="text-sm font-medium text-dark-200">
              Notify group members on creation
            </label>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={() => router.push("/admin/sheets")}
            className="btn-secondary"
          >
            Cancel
          </button>
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? "Creating..." : "Create Sheet"}
          </button>
        </div>
      </form>
    </div>
  );
}
