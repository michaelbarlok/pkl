"use client";

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

export default function AdminSheetDetailPage() {
  const { supabase } = useSupabase();
  const router = useRouter();
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
  const [signupClosesAt, setSignupClosesAt] = useState("");
  const [withdrawClosesAt, setWithdrawClosesAt] = useState("");

  // Player search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const [searching, setSearching] = useState(false);

  const confirmed = registrations.filter((r) => r.status === "confirmed");
  const waitlisted = registrations.filter((r) => r.status === "waitlist");

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
    if (!confirm("Are you sure you want to cancel this event? All registrants will be notified.")) return;

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
    if (!confirm("Remove this player from the sheet?")) return;
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

  async function handleStartShootout() {
    if (!sheet) return;
    if (
      !confirm(
        "Create a shootout session from this sheet? Confirmed players will be added as participants."
      )
    )
      return;

    try {
      const { data: session, error: sessionErr } = await supabase
        .from("shootout_sessions")
        .insert({
          sheet_id: sheetId,
          group_id: sheet.group_id,
          status: "created",
          num_courts: Math.floor(confirmed.length / 4) || 1,
          current_round: 0,
          is_same_day_continuation: false,
        })
        .select()
        .single();

      if (sessionErr) throw sessionErr;

      // Add confirmed players as participants
      const participants = confirmed.map((reg) => ({
        session_id: session.id,
        group_id: sheet.group_id,
        player_id: reg.player_id,
        checked_in: false,
        step_before: 0,
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
        <div className="text-gray-500">Loading sheet...</div>
      </div>
    );
  }

  if (!sheet) {
    return (
      <div className="card text-center text-red-600">
        Sheet not found.{" "}
        <Link href="/admin/sheets" className="text-brand-600 hover:text-brand-500">
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
            className="text-sm text-brand-600 hover:text-brand-500"
          >
            &larr; All Sheets
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-gray-900">
            Edit Sheet: {sheet.group?.name ?? "Event"}
          </h1>
        </div>
        <div className="flex gap-2">
          {sheet.status !== "cancelled" && (
            <button onClick={handleCancel} className="btn-danger">
              Cancel Event
            </button>
          )}
          <button
            onClick={handleStartShootout}
            className="btn-primary"
            disabled={confirmed.length < 4}
            title={
              confirmed.length < 4
                ? "Need at least 4 confirmed players"
                : undefined
            }
          >
            Start Shootout
          </button>
        </div>
      </div>

      {sheet.status === "cancelled" && (
        <div className="rounded-md bg-red-50 p-4 text-red-800 font-medium">
          This event has been cancelled.
        </div>
      )}

      {error && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-md bg-green-50 p-3 text-sm text-green-700">
          {success}
        </div>
      )}

      {/* Edit Form */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Sheet Details
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
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
            <label className="block text-sm font-medium text-gray-700 mb-1">
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
            <label className="block text-sm font-medium text-gray-700 mb-1">
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
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Location
            </label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="input"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
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
            <label className="block text-sm font-medium text-gray-700 mb-1">
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
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Roster Management
        </h2>

        {/* Add Player Search */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-1">
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
            <div className="mt-2 border rounded-md divide-y divide-gray-100">
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
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-200 text-xs font-medium text-gray-600">
                        {p.display_name?.charAt(0) ?? "?"}
                      </div>
                    )}
                    <span className="text-sm text-gray-900">
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
        <h3 className="text-sm font-semibold text-gray-700 mb-2">
          Confirmed ({confirmed.length}/{playerLimit})
        </h3>
        {confirmed.length > 0 ? (
          <div className="border rounded-md divide-y divide-gray-100 mb-6">
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
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-200 text-xs font-medium text-gray-600">
                      {reg.player?.display_name?.charAt(0) ?? "?"}
                    </div>
                  )}
                  <span className="text-sm text-gray-900">
                    {reg.player?.display_name ?? "Unknown"}
                  </span>
                  {reg.registered_by && reg.registered_by !== reg.player_id && (
                    <span className="badge-gray text-xs">Admin added</span>
                  )}
                </div>
                <button
                  onClick={() => handleRemovePlayer(reg.id)}
                  className="btn-danger text-xs"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500 mb-6">
            No confirmed players yet.
          </p>
        )}

        {/* Waitlist */}
        <h3 className="text-sm font-semibold text-gray-700 mb-2">
          Waitlist ({waitlisted.length})
        </h3>
        {waitlisted.length > 0 ? (
          <div className="border rounded-md divide-y divide-gray-100">
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
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-200 text-xs font-medium text-gray-600">
                      {reg.player?.display_name?.charAt(0) ?? "?"}
                    </div>
                  )}
                  <span className="text-sm text-gray-900">
                    {reg.player?.display_name ?? "Unknown"}
                  </span>
                  <span className="badge-yellow text-xs">Waitlisted</span>
                </div>
                <div className="flex gap-2">
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
          <p className="text-sm text-gray-500">No one on the waitlist.</p>
        )}
      </div>
    </div>
  );
}
