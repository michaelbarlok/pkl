"use client";

import { useConfirm } from "@/components/confirm-modal";
import { useSupabase } from "@/components/providers/supabase-provider";
import { useRouter, useParams } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import type {
  SignupSheet,
  Registration,
  Profile,
  ShootoutGroup,
} from "@/types/database";
import { PRIORITY_ORDER } from "@/lib/utils";

export default function AdminSheetDetailPage() {
  const { supabase } = useSupabase();
  const router = useRouter();
  const confirm = useConfirm();
  const params = useParams<{ id: string }>();
  const sheetId = params.id;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [sheet, setSheet] = useState<
    (SignupSheet & { group?: ShootoutGroup }) | null
  >(null);
  const [registrations, setRegistrations] = useState<
    (Registration & { player?: Profile })[]
  >([]);

  // Form fields
  const [eventDate, setEventDate] = useState("");
  const [eventTime, setEventTime] = useState("");
  const [playerLimit, setPlayerLimit] = useState(0);
  const [location, setLocation] = useState("");
  const [savedLocations, setSavedLocations] = useState<{ name: string; cityState: string }[]>([]);
  const [signupClosesAt, setSignupClosesAt] = useState("");
  const [withdrawClosesAt, setWithdrawClosesAt] = useState("");

  // Court selection for shootout
  const [numCourts, setNumCourts] = useState<number | null>(null);

  // Player search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const [searching, setSearching] = useState(false);

  const sortByPriority = (a: Registration, b: Registration) => {
    const aPri = PRIORITY_ORDER[a.priority ?? "normal"] ?? 1;
    const bPri = PRIORITY_ORDER[b.priority ?? "normal"] ?? 1;
    if (aPri !== bPri) return aPri - bPri;
    return new Date(a.signed_up_at).getTime() - new Date(b.signed_up_at).getTime();
  };
  const confirmed = registrations.filter((r) => r.status === "confirmed").sort(sortByPriority);
  const waitlisted = registrations.filter((r) => r.status === "waitlist").sort(sortByPriority);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: sheetData, error: sheetErr } = await supabase
        .from("signup_sheets")
        .select("*, group:shootout_groups(*)")
        .eq("id", sheetId)
        .single();

      if (sheetErr || !sheetData) {
        setError("Sheet not found.");
        return;
      }

      setSheet(sheetData);
      setEventDate(sheetData.event_date);
      setEventTime(sheetData.event_time);
      setPlayerLimit(sheetData.player_limit);
      setLocation(sheetData.location);

      // Load saved locations for dropdown
      const [sheetsLocRes, tournamentsLocRes] = await Promise.all([
        supabase.from("signup_sheets").select("location, group:shootout_groups(city, state)"),
        supabase.from("tournaments").select("location"),
      ]);
      const locMap = new Map<string, string>();
      for (const s of sheetsLocRes.data ?? []) {
        const loc = (s as any).location?.trim();
        if (!loc) continue;
        if (!locMap.has(loc)) {
          const g = (s as any).group;
          const cs = [g?.city, g?.state].filter(Boolean).join(", ");
          locMap.set(loc, cs);
        }
      }
      for (const t of tournamentsLocRes.data ?? []) {
        const loc = (t as any).location?.trim();
        if (loc && !locMap.has(loc)) locMap.set(loc, "");
      }
      setSavedLocations(
        Array.from(locMap.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([name, cityState]) => ({ name, cityState }))
      );

      setSignupClosesAt(
        sheetData.signup_closes_at
          ? sheetData.signup_closes_at.slice(0, 16)
          : ""
      );
      setWithdrawClosesAt(
        sheetData.withdraw_closes_at
          ? sheetData.withdraw_closes_at.slice(0, 16)
          : ""
      );

      const { data: regData } = await supabase
        .from("registrations")
        .select("*, player:profiles!registrations_player_id_fkey(*)")
        .eq("sheet_id", sheetId)
        .in("status", ["confirmed", "waitlist"])
        .order("signed_up_at", { ascending: true });

      setRegistrations(regData ?? []);
    } catch {
      setError("Failed to load sheet data.");
    } finally {
      setLoading(false);
    }
  }, [supabase, sheetId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handleSave() {
    if (!sheet) return;
    setError(null);
    setSuccess(null);

    // Validate player limit
    if (playerLimit < confirmed.length) {
      setError(
        `Cannot reduce player limit below current registration count (${confirmed.length} confirmed players).`
      );
      return;
    }

    setSaving(true);
    try {
      const { error: updateErr } = await supabase
        .from("signup_sheets")
        .update({
          event_date: eventDate,
          event_time: eventTime,
          player_limit: playerLimit,
          location,
          signup_closes_at: signupClosesAt
            ? new Date(signupClosesAt).toISOString()
            : sheet.signup_closes_at,
          withdraw_closes_at: withdrawClosesAt
            ? new Date(withdrawClosesAt).toISOString()
            : null,
        })
        .eq("id", sheetId);

      if (updateErr) throw updateErr;
      setSuccess("Sheet updated successfully.");
      await fetchData();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to save changes.";
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  async function handleCancel() {
    const ok = await confirm({
      title: "Cancel this event?",
      description: "All registrants will be notified that the event has been cancelled.",
      confirmLabel: "Cancel Event",
      variant: "warning",
    });
    if (!ok) return;

    try {
      const res = await fetch(`/api/sheets/${sheetId}/cancel`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error ?? "Failed to cancel sheet.");
      }
      router.push("/admin/sheets");
      router.refresh();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to cancel.";
      setError(message);
    }
  }

  async function handleSearchPlayers() {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .ilike("display_name", `%${searchQuery}%`)
        .limit(10);
      // Filter out already registered players
      const registeredIds = new Set(registrations.map((r) => r.player_id));
      setSearchResults(
        (data ?? []).filter((p: Profile) => !registeredIds.has(p.id))
      );
    } finally {
      setSearching(false);
    }
  }

  async function handleAddPlayer(playerId: string) {
    setError(null);
    try {
      const status =
        confirmed.length < playerLimit ? "confirmed" : "waitlist";
      const waitlistPosition =
        status === "waitlist" ? waitlisted.length + 1 : null;

      const { error: insertErr } = await supabase
        .from("registrations")
        .insert({
          sheet_id: sheetId,
          player_id: playerId,
          status,
          waitlist_position: waitlistPosition,
          registered_by: (
            await supabase.auth.getUser()
          ).data.user?.id,
        });

      if (insertErr) throw insertErr;
      setSearchQuery("");
      setSearchResults([]);
      await fetchData();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to add player.";
      setError(message);
    }
  }

  async function handleRemovePlayer(registrationId: string) {
    const ok = await confirm({
      title: "Remove player from sheet?",
      description: "If there is a waitlist, the next player will be promoted automatically.",
      confirmLabel: "Remove",
      variant: "danger",
    });
    if (!ok) return;
    try {
      const { error: delErr } = await supabase
        .from("registrations")
        .update({ status: "withdrawn" })
        .eq("id", registrationId);

      if (delErr) throw delErr;
      await fetchData();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to remove player.";
      setError(message);
    }
  }

  async function handlePromotePlayer(registrationId: string) {
    try {
      const { error: promoteErr } = await supabase
        .from("registrations")
        .update({ status: "confirmed", waitlist_position: null })
        .eq("id", registrationId);

      if (promoteErr) throw promoteErr;
      await fetchData();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to promote player.";
      setError(message);
    }
  }

  async function handleSetPriority(registrationId: string, priority: string) {
    setError(null);
    try {
      const res = await fetch(`/api/sheets/registrations/${registrationId}/priority`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priority }),
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error ?? "Failed to update priority.");
      }
      await fetchData();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to update priority.";
      setError(message);
    }
  }

  async function handleStartShootout() {
    if (!sheet) return;
    if (!numCourts || numCourts < 1) {
      setError("Please select the number of courts before starting.");
      return;
    }
    // Validate court count produces valid distribution (4-5 per court)
    const perCourt = confirmed.length / numCourts;
    if (perCourt < 4 || perCourt > 5) {
      setError(
        `${confirmed.length} players across ${numCourts} courts doesn't work (need 4-5 per court).`
      );
      return;
    }
    const ok = await confirm({
      title: "Start shootout session?",
      description: `${numCourts} court${numCourts > 1 ? "s" : ""} · ${confirmed.length} players`,
      confirmLabel: "Start Session",
      variant: "default",
    });
    if (!ok) return;

    try {
      // Block if there's already an active (non-complete) session
      const { data: activeSessions } = await supabase
        .from("shootout_sessions")
        .select("id, status")
        .eq("sheet_id", sheetId)
        .neq("status", "session_complete")
        .limit(1);

      if (activeSessions && activeSessions.length > 0) {
        setError("There is already an active session for this sheet. Complete it before starting a new one.");
        return;
      }

      const { data: session, error: sessionErr } = await supabase
        .from("shootout_sessions")
        .insert({
          sheet_id: sheetId,
          group_id: sheet.group_id,
          status: "created",
          num_courts: numCourts,
          current_round: 0,
          is_same_day_continuation: false,
        })
        .select()
        .single();

      if (sessionErr) throw sessionErr;

      // Fetch current steps from group_memberships for confirmed players
      const playerIds = confirmed.map((reg) => reg.player_id);
      const { data: memberships } = await supabase
        .from("group_memberships")
        .select("player_id, current_step")
        .eq("group_id", sheet.group_id)
        .in("player_id", playerIds);

      const stepMap = new Map(
        (memberships ?? []).map((m: any) => [m.player_id, m.current_step])
      );

      // Add confirmed players as participants with their actual step
      const participants = confirmed.map((reg) => ({
        session_id: session.id,
        group_id: sheet.group_id,
        player_id: reg.player_id,
        checked_in: false,
        step_before: stepMap.get(reg.player_id) ?? 1,
      }));

      if (participants.length > 0) {
        const { error: partErr } = await supabase
          .from("session_participants")
          .insert(participants);
        if (partErr) throw partErr;
      }

      router.push(`/admin/sessions/${session.id}`);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to create session.";
      setError(message);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-surface-muted">Loading sheet...</div>
      </div>
    );
  }

  if (!sheet) {
    return (
      <div className="card text-center text-red-400">
        Sheet not found.{" "}
        <Link href="/admin/sheets" className="text-brand-400 hover:text-brand-300">
          Back to sheets
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <Link
            href="/admin/sheets"
            className="text-sm text-brand-400 hover:text-brand-300"
          >
            &larr; All Sheets
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-dark-100">
            Edit Sheet: {sheet.group?.name ?? "Event"}
          </h1>
        </div>
        <div className="flex gap-2">
          {sheet.status !== "cancelled" && (
            <button onClick={handleCancel} className="btn-danger">
              Cancel Event
            </button>
          )}
          {confirmed.length >= 4 && (
            <div className="flex items-center gap-2">
              <label className="text-sm text-dark-200">Courts:</label>
              <select
                value={numCourts ?? ""}
                onChange={(e) => setNumCourts(e.target.value ? Number(e.target.value) : null)}
                className="input w-20 py-1"
              >
                <option value="">—</option>
                {Array.from(
                  { length: Math.floor(confirmed.length / 4) },
                  (_, i) => i + 1
                )
                  .filter((n) => {
                    const perCourt = confirmed.length / n;
                    return perCourt >= 4 && perCourt <= 5;
                  })
                  .map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
              </select>
            </div>
          )}
          <button
            onClick={handleStartShootout}
            className="btn-primary"
            disabled={confirmed.length < 4 || !numCourts}
            title={
              confirmed.length < 4
                ? "Need at least 4 confirmed players"
                : !numCourts
                ? "Select number of courts"
                : undefined
            }
          >
            Start Shootout
          </button>
        </div>
      </div>

      {sheet.status === "cancelled" && (
        <div className="rounded-md bg-red-900/30 p-4 text-red-300 font-medium">
          This event has been cancelled.
        </div>
      )}

      {error && (
        <div className="rounded-md bg-red-900/30 p-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-md bg-teal-900/30 p-3 text-sm text-teal-300">
          {success}
        </div>
      )}

      {/* Edit Form */}
      <div className="card">
        <h2 className="text-lg font-semibold text-dark-100 mb-4">
          Sheet Details
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-dark-200 mb-1">
              Event Date
            </label>
            <input
              type="date"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              className="input"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-dark-200 mb-1">
              Event Time
            </label>
            <input
              type="time"
              value={eventTime}
              onChange={(e) => setEventTime(e.target.value)}
              className="input"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-dark-200 mb-1">
              Player Limit
            </label>
            <input
              type="number"
              min={1}
              value={playerLimit}
              onChange={(e) => setPlayerLimit(Number(e.target.value))}
              className="input"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-dark-200 mb-1">
              Location
            </label>
            {savedLocations.length > 0 ? (
              <div className="space-y-2">
                <select
                  value={savedLocations.some((l) => l.name === location) ? location : "__custom__"}
                  onChange={(e) => {
                    if (e.target.value === "__custom__") {
                      setLocation("");
                    } else {
                      setLocation(e.target.value);
                    }
                  }}
                  className="input"
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
                    className="input"
                    placeholder="Enter new location name"
                  />
                )}
              </div>
            ) : (
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="input"
              />
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-dark-200 mb-1">
              Sign-Up Closes At
            </label>
            <input
              type="datetime-local"
              value={signupClosesAt}
              onChange={(e) => setSignupClosesAt(e.target.value)}
              className="input"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-dark-200 mb-1">
              Withdraw Closes At
            </label>
            <input
              type="datetime-local"
              value={withdrawClosesAt}
              onChange={(e) => setWithdrawClosesAt(e.target.value)}
              className="input"
            />
          </div>
        </div>
        <div className="mt-6 flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-primary"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>

      {/* Admin Roster Overrides */}
      <div className="card">
        <h2 className="text-lg font-semibold text-dark-100 mb-4">
          Roster Management
        </h2>

        {/* Add Player Search */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-dark-200 mb-1">
            Add Player
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Search by name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearchPlayers()}
              className="input flex-1"
            />
            <button
              onClick={handleSearchPlayers}
              disabled={searching}
              className="btn-secondary"
            >
              {searching ? "Searching..." : "Search"}
            </button>
          </div>
          {searchResults.length > 0 && (
            <div className="mt-2 border rounded-md divide-y divide-surface-border">
              {searchResults.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    {p.avatar_url ? (
                      <img
                        src={p.avatar_url}
                        alt=""
                        className="h-6 w-6 rounded-full object-cover"
                      />
                    ) : (
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-surface-overlay text-xs font-medium text-surface-muted">
                        {p.display_name?.charAt(0) ?? "?"}
                      </div>
                    )}
                    <span className="text-sm text-dark-100">
                      {p.display_name}
                    </span>
                    {p.skill_level && (
                      <span className="badge-blue text-xs">
                        {p.skill_level}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => handleAddPlayer(p.id)}
                    className="btn-primary text-xs"
                  >
                    Add
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Confirmed Players */}
        <h3 className="text-sm font-semibold text-dark-200 mb-2">
          Confirmed ({confirmed.length}/{playerLimit})
        </h3>
        {confirmed.length > 0 ? (
          <div className="border rounded-md divide-y divide-surface-border mb-6">
            {confirmed.map((reg) => (
              <div
                key={reg.id}
                className="flex items-center justify-between px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  {reg.player?.avatar_url ? (
                    <img
                      src={reg.player.avatar_url}
                      alt=""
                      className="h-6 w-6 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-surface-overlay text-xs font-medium text-surface-muted">
                      {reg.player?.display_name?.charAt(0) ?? "?"}
                    </div>
                  )}
                  <span className="text-sm text-dark-100">
                    {reg.player?.display_name ?? "Unknown"}
                  </span>
                  {reg.registered_by && reg.registered_by !== reg.player_id && (
                    <span className="badge-gray text-xs">Admin added</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={(reg as any).priority ?? "normal"}
                    onChange={(e) => handleSetPriority(reg.id, e.target.value)}
                    className="input py-0.5 px-1.5 text-xs w-24"
                  >
                    <option value="high">High</option>
                    <option value="normal">Normal</option>
                    <option value="low">Low</option>
                  </select>
                  <button
                    onClick={() => handleRemovePlayer(reg.id)}
                    className="btn-danger text-xs"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-surface-muted mb-6">
            No confirmed players yet.
          </p>
        )}

        {/* Waitlist */}
        <h3 className="text-sm font-semibold text-dark-200 mb-2">
          Waitlist ({waitlisted.length})
        </h3>
        {waitlisted.length > 0 ? (
          <div className="border rounded-md divide-y divide-surface-border">
            {waitlisted.map((reg) => (
              <div
                key={reg.id}
                className="flex items-center justify-between px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  {reg.player?.avatar_url ? (
                    <img
                      src={reg.player.avatar_url}
                      alt=""
                      className="h-6 w-6 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-surface-overlay text-xs font-medium text-surface-muted">
                      {reg.player?.display_name?.charAt(0) ?? "?"}
                    </div>
                  )}
                  <span className="text-sm text-dark-100">
                    {reg.player?.display_name ?? "Unknown"}
                  </span>
                  <span className="badge-yellow text-xs">Waitlisted</span>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={(reg as any).priority ?? "normal"}
                    onChange={(e) => handleSetPriority(reg.id, e.target.value)}
                    className="input py-0.5 px-1.5 text-xs w-24"
                  >
                    <option value="high">High</option>
                    <option value="normal">Normal</option>
                    <option value="low">Low</option>
                  </select>
                  <button
                    onClick={() => handlePromotePlayer(reg.id)}
                    className="btn-secondary text-xs"
                  >
                    Promote
                  </button>
                  <button
                    onClick={() => handleRemovePlayer(reg.id)}
                    className="btn-danger text-xs"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-surface-muted">No one on the waitlist.</p>
        )}
      </div>
    </div>
  );
}
