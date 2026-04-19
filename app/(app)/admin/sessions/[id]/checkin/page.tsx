"use client";

import { useConfirm } from "@/components/confirm-modal";
import { useSupabase } from "@/components/providers/supabase-provider";
import { distributeCourts, seedSession1, seedSameDaySession } from "@/lib/shootout-engine";
import type { RankedPlayer, SeedablePlayer } from "@/lib/shootout-engine";
import { isTestUser } from "@/lib/test-users";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface ParticipantRow {
  id: string;
  player_id: string;
  display_name: string;
  avatar_url: string | null;
  checked_in: boolean;
  court_number: number | null;
  current_step: number;
  win_pct: number;
  last_played_at: string | null;
  total_sessions: number;
  target_court_next: number | null;
  prev_court_number: number | null;
  is_guest: boolean;
}

interface GroupMember {
  id: string;
  display_name: string;
  avatar_url: string | null;
  current_step: number;
  win_pct: number;
}

export default function CheckInPage() {
  const { id: sessionId } = useParams<{ id: string }>();
  const { supabase } = useSupabase();
  const router = useRouter();
  const confirm = useConfirm();
  const [participants, setParticipants] = useState<ParticipantRow[]>([]);
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [seedError, setSeedError] = useState<string | null>(null);

  // Guest form state
  const [showGuestForm, setShowGuestForm] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [addingGuest, setAddingGuest] = useState(false);
  const [guestError, setGuestError] = useState<string | null>(null);

  // Add member form state
  const [showAddMemberForm, setShowAddMemberForm] = useState(false);
  const [memberSearch, setMemberSearch] = useState("");
  const [groupMembers, setGroupMembers] = useState<GroupMember[]>([]);
  const [selectedMember, setSelectedMember] = useState<GroupMember | null>(null);
  const [removeParticipantId, setRemoveParticipantId] = useState("");
  const [addingMember, setAddingMember] = useState(false);
  const [addMemberError, setAddMemberError] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  async function fetchData() {
    // Fetch session
    const { data: sess } = await supabase
      .from("shootout_sessions")
      .select("*, group:shootout_groups(*)")
      .eq("id", sessionId)
      .single();
    setSession(sess);

    // Fetch participants with profile and group membership data
    const { data: parts } = await supabase
      .from("session_participants")
      .select("*, player:profiles(id, display_name, avatar_url, is_guest)")
      .eq("session_id", sessionId)
      .order("court_number", { ascending: true, nullsFirst: false });

    if (parts && sess) {
      // Fetch group memberships for these players
      const playerIds = parts.map((p: any) => p.player_id);
      const { data: memberships } = await supabase
        .from("group_memberships")
        .select("*")
        .eq("group_id", sess.group_id)
        .in("player_id", playerIds);

      const memberMap = new Map(
        (memberships ?? []).map((m: any) => [m.player_id, m])
      );

      // For same-day continuations, fetch previous session courts so we can show movement direction
      const prevCourtMap = new Map<string, number>();
      if (sess.is_same_day_continuation && sess.prev_session_id) {
        const { data: prevParts } = await supabase
          .from("session_participants")
          .select("player_id, court_number")
          .eq("session_id", sess.prev_session_id)
          .not("court_number", "is", null);
        for (const pp of prevParts ?? []) {
          if (pp.court_number != null) prevCourtMap.set(pp.player_id, pp.court_number);
        }
      }

      const rows: ParticipantRow[] = parts.map((p: any) => {
        const membership = memberMap.get(p.player_id);
        return {
          id: p.id,
          player_id: p.player_id,
          display_name: p.player?.display_name ?? "Unknown",
          avatar_url: p.player?.avatar_url ?? null,
          checked_in: p.checked_in,
          court_number: p.court_number,
          current_step: membership?.current_step ?? 99,
          win_pct: membership?.win_pct ?? 0,
          last_played_at: membership?.last_played_at ?? null,
          total_sessions: membership?.total_sessions ?? 0,
          target_court_next: p.target_court_next,
          prev_court_number: prevCourtMap.get(p.player_id) ?? null,
          is_guest: p.player?.is_guest ?? false,
        };
      });

      setParticipants(rows);
    }
    setLoading(false);
  }

  async function toggleCheckIn(participantId: string) {
    const p = participants.find((x) => x.id === participantId);
    if (!p) return;

    await supabase
      .from("session_participants")
      .update({ checked_in: !p.checked_in })
      .eq("id", participantId);

    setParticipants((prev) =>
      prev.map((x) =>
        x.id === participantId ? { ...x, checked_in: !x.checked_in } : x
      )
    );
  }

  async function checkInAll() {
    await supabase
      .from("session_participants")
      .update({ checked_in: true })
      .eq("session_id", sessionId);

    setParticipants((prev) => prev.map((x) => ({ ...x, checked_in: true })));
  }

  async function updateCourtNumber(participantId: string, courtNum: number | null) {
    setParticipants((prev) =>
      prev.map((x) =>
        x.id === participantId ? { ...x, court_number: courtNum } : x
      )
    );

    await supabase
      .from("session_participants")
      .update({ court_number: courtNum })
      .eq("id", participantId);
  }

  async function seedPlayers() {
    if (!session) return;
    setSeeding(true);
    setSeedError(null);

    const checkedIn = participants.filter((p) => p.checked_in);
    const unchecked = participants.filter((p) => !p.checked_in);

    if (checkedIn.length === 0) {
      setSeeding(false);
      return;
    }

    // Confirm before removing no-show players
    if (unchecked.length > 0) {
      const names = unchecked.map((p) => p.display_name).join(", ");
      const ok = await confirm({
        title: `Remove ${unchecked.length} no-show player${unchecked.length > 1 ? "s" : ""}?`,
        description: `${names} ${unchecked.length > 1 ? "are" : "is"} not checked in and will be removed from this session. This cannot be undone.`,
        confirmLabel: "Remove & Seed",
        variant: "danger",
      });
      if (!ok) {
        setSeeding(false);
        return;
      }
    }

    try {
      // Remove unchecked players from the session
      if (unchecked.length > 0) {
        await Promise.all(
          unchecked.map((p) =>
            supabase
              .from("session_participants")
              .delete()
              .eq("id", p.id)
          )
        );
        setParticipants((prev) => prev.filter((p) => p.checked_in));
      }

      let positions;

      const isSessionContinuation = session.is_same_day_continuation && session.prev_session_id;
      const isDynamicRanking = session?.group?.ladder_type === "dynamic_ranking";

      if (isSessionContinuation && !isDynamicRanking) {
        // Court Promotion: players who finished the previous round are anchored to
        // their target_court_next. Players added fresh (no target court — e.g. a
        // waitlist member subbing in) are sorted by ranking and slotted into space.
        const seedablePlayers: SeedablePlayer[] = checkedIn.map((p) => ({
          id: p.player_id,
          currentStep: p.current_step,
          winPct: p.win_pct,
          lastPlayedAt: p.last_played_at,
          totalSessions: p.total_sessions,
          targetCourtNext: p.target_court_next,
          seedSource: p.target_court_next != null ? "previous_court" : "ranking_sheet",
        }));
        positions = seedSameDaySession(seedablePlayers, session.num_courts);
      } else {
        // Dynamic Ranking continuation OR session 1: ignore any target_court_next and
        // re-seed all players from scratch using their current (freshly updated) step
        // and win %. This reflects post-round step changes in the new court order.
        const rankedPlayers: RankedPlayer[] = checkedIn.map((p) => ({
          id: p.player_id,
          currentStep: p.current_step,
          winPct: p.win_pct,
          lastPlayedAt: p.last_played_at,
          totalSessions: p.total_sessions,
        }));
        positions = seedSession1(rankedPlayers, session.num_courts);
      }

      // Apply court numbers for all checked-in players
      const updates = positions
        .map((pos) => {
          const participant = participants.find((p) => p.player_id === pos.playerId);
          return participant
            ? supabase
                .from("session_participants")
                .update({ court_number: pos.courtNumber })
                .eq("id", participant.id)
            : null;
        })
        .filter(Boolean);

      await Promise.all(updates);

      // Update local state and sort by court number, then step ASC, then win% DESC
      const posMap = new Map(positions.map((p) => [p.playerId, p.courtNumber]));
      setParticipants((prev) => {
        const updated = prev.map((p) => {
          const court = posMap.get(p.player_id);
          return court != null ? { ...p, court_number: court } : p;
        });
        return updated.sort((a, b) => {
          const aCourt = a.court_number ?? 999;
          const bCourt = b.court_number ?? 999;
          if (aCourt !== bCourt) return aCourt - bCourt;
          if (a.current_step !== b.current_step) return a.current_step - b.current_step;
          return b.win_pct - a.win_pct;
        });
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Seeding failed";
      setSeedError(msg);
    }

    setSeeding(false);
  }

  async function confirmAndStartSeeding() {
    await supabase
      .from("shootout_sessions")
      .update({ status: "seeding" })
      .eq("id", sessionId);

    router.push(`/admin/sessions/${sessionId}`);
  }

  async function addGuest(e: React.FormEvent) {
    e.preventDefault();
    setGuestError(null);
    setAddingGuest(true);

    const res = await fetch(`/api/sessions/${sessionId}/add-guest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ display_name: guestName, email: guestEmail || undefined }),
    });

    const data = await res.json();
    if (!res.ok) {
      setGuestError(data.error ?? "Failed to add guest");
      setAddingGuest(false);
      return;
    }

    await fetchData();
    setGuestName("");
    setGuestEmail("");
    setShowGuestForm(false);
    setAddingGuest(false);
  }

  async function openAddMemberForm() {
    setShowAddMemberForm(true);
    setSelectedMember(null);
    setRemoveParticipantId("");
    setMemberSearch("");
    setAddMemberError(null);
    setShowGuestForm(false);

    // Fetch group members not already in this session
    const existingIds = new Set(participants.map((p) => p.player_id));
    const { data: memberships } = await supabase
      .from("group_memberships")
      .select("player_id, current_step, win_pct, player:profiles(id, display_name, avatar_url)")
      .eq("group_id", session.group_id);

    const members: GroupMember[] = (memberships ?? [])
      .filter((m: any) => !existingIds.has(m.player_id))
      .filter((m: any) => !isTestUser(m.player?.display_name))
      .map((m: any) => ({
        id: m.player_id,
        display_name: m.player?.display_name ?? "Unknown",
        avatar_url: m.player?.avatar_url ?? null,
        current_step: m.current_step ?? 1,
        win_pct: m.win_pct ?? 0,
      }))
      .sort((a: GroupMember, b: GroupMember) =>
        a.display_name.localeCompare(b.display_name)
      );

    setGroupMembers(members);
  }

  async function handleAddMember() {
    if (!selectedMember || !session) return;
    setAddingMember(true);
    setAddMemberError(null);

    try {
      // Remove the no-show first (if selected)
      if (removeParticipantId) {
        const { error: delErr } = await supabase
          .from("session_participants")
          .delete()
          .eq("id", removeParticipantId);
        if (delErr) throw delErr;
      }

      // Add the new member, checked in and ready to play
      const { error: insertErr } = await supabase
        .from("session_participants")
        .insert({
          session_id: sessionId,
          group_id: session.group_id,
          player_id: selectedMember.id,
          checked_in: true,
          step_before: selectedMember.current_step,
        });
      if (insertErr) throw insertErr;

      await fetchData();
      setShowAddMemberForm(false);
      setSelectedMember(null);
      setRemoveParticipantId("");
      setMemberSearch("");
    } catch (err) {
      setAddMemberError(err instanceof Error ? err.message : "Failed to add member");
    }

    setAddingMember(false);
  }

  if (loading) return <div className="text-center py-12 text-surface-muted">Loading...</div>;
  if (!session) return <div className="text-center py-12 text-surface-muted">Session not found.</div>;

  const isPrivateGroup = session.group?.visibility === "private";
  const checkedInCount = participants.filter((p) => p.checked_in).length;
  const filteredMembers = groupMembers.filter((m) =>
    m.display_name.toLowerCase().includes(memberSearch.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-dark-100">Check-In</h1>
          <p className="text-sm text-surface-muted">
            {session.group?.name} — {checkedInCount} / {participants.length} checked in
          </p>
        </div>
        <div className="flex gap-3 flex-wrap">
          <button
            onClick={() => {
              if (showAddMemberForm) {
                setShowAddMemberForm(false);
              } else {
                openAddMemberForm();
              }
            }}
            className="btn-secondary"
          >
            + Add Member
          </button>
          {isPrivateGroup && (
            <button
              onClick={() => { setShowGuestForm((v) => !v); setShowAddMemberForm(false); setGuestError(null); }}
              className="btn-secondary"
            >
              + Add Guest
            </button>
          )}
          <button onClick={checkInAll} className="btn-secondary">
            Check In All
          </button>
          <button
            onClick={seedPlayers}
            className="btn-primary"
            disabled={seeding || checkedInCount === 0}
          >
            {seeding ? "Seeding..." : "Seed Players"}
          </button>
          <button onClick={confirmAndStartSeeding} className="btn-primary">
            Confirm &amp; Start
          </button>
        </div>
      </div>

      {/* Add Member Form */}
      {showAddMemberForm && (
        <div className="card space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-dark-100">Add Member</h3>
            <p className="text-xs text-surface-muted mt-0.5">
              Add a group member who wasn&apos;t on the original sign-up sheet.
              Optionally remove a no-show at the same time.
            </p>
          </div>

          {!selectedMember ? (
            /* Step 1: search and pick a member */
            <div className="space-y-3">
              <input
                type="text"
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                className="input w-full"
                placeholder="Search members..."
                autoFocus
              />
              {groupMembers.length === 0 ? (
                <p className="text-sm text-surface-muted py-2">
                  All group members are already in this session.
                </p>
              ) : filteredMembers.length === 0 ? (
                <p className="text-sm text-surface-muted py-2">No members match &ldquo;{memberSearch}&rdquo;.</p>
              ) : (
                <div className="divide-y divide-surface-border rounded-lg border border-surface-border overflow-hidden max-h-64 overflow-y-auto">
                  {filteredMembers.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setSelectedMember(m)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-surface-overlay transition-colors text-left"
                    >
                      {m.avatar_url ? (
                        <img src={m.avatar_url} alt="" className="h-7 w-7 rounded-full object-cover shrink-0" />
                      ) : (
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-900/50 text-brand-300 text-xs font-medium shrink-0">
                          {m.display_name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <span className="flex-1 text-sm font-medium text-dark-100">{m.display_name}</span>
                      <span className="text-xs text-surface-muted">Step {m.current_step} · {m.win_pct.toFixed(1)}%</span>
                    </button>
                  ))}
                </div>
              )}
              <button
                type="button"
                onClick={() => setShowAddMemberForm(false)}
                className="btn-secondary btn-sm"
              >
                Cancel
              </button>
            </div>
          ) : (
            /* Step 2: confirm add + optionally pick a no-show to remove */
            <div className="space-y-4">
              {/* Selected member */}
              <div className="flex items-center gap-3 rounded-lg bg-teal-900/20 border border-teal-500/30 px-3 py-2.5">
                {selectedMember.avatar_url ? (
                  <img src={selectedMember.avatar_url} alt="" className="h-7 w-7 rounded-full object-cover shrink-0" />
                ) : (
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-900/50 text-brand-300 text-xs font-medium shrink-0">
                    {selectedMember.display_name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-teal-300">{selectedMember.display_name}</p>
                  <p className="text-xs text-surface-muted">Step {selectedMember.current_step} · {selectedMember.win_pct.toFixed(1)}% Pt</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedMember(null)}
                  className="text-xs text-surface-muted hover:text-dark-200 transition-colors shrink-0"
                >
                  Change
                </button>
              </div>

              {/* Optional: remove a no-show */}
              <div>
                <label className="block text-xs font-medium text-dark-200 mb-1.5">
                  Remove a no-show{" "}
                  <span className="text-surface-muted font-normal">(optional)</span>
                </label>
                <select
                  value={removeParticipantId}
                  onChange={(e) => setRemoveParticipantId(e.target.value)}
                  className="input w-full"
                >
                  <option value="">— Keep everyone, just add —</option>
                  {participants
                    .filter((p) => !p.is_guest)
                    .sort((a, b) => a.display_name.localeCompare(b.display_name))
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.display_name} (Step {p.current_step})
                      </option>
                    ))}
                </select>
                {removeParticipantId && (
                  <p className="mt-1 text-xs text-accent-300">
                    {participants.find((p) => p.id === removeParticipantId)?.display_name} will be removed from this session.
                  </p>
                )}
              </div>

              {addMemberError && (
                <p className="text-sm text-red-400">{addMemberError}</p>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleAddMember}
                  disabled={addingMember}
                  className="btn-primary btn-sm disabled:opacity-50"
                >
                  {addingMember
                    ? "Saving..."
                    : removeParticipantId
                    ? `Swap in ${selectedMember.display_name}`
                    : `Add ${selectedMember.display_name}`}
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddMemberForm(false)}
                  className="btn-secondary btn-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Add Guest Form */}
      {showGuestForm && (
        <form onSubmit={addGuest} className="card space-y-3">
          <h3 className="text-sm font-semibold text-dark-100">Add Guest</h3>
          <p className="text-xs text-surface-muted">
            Guests play this session only and are not added to the group roster. Steps and point % are not tracked.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-dark-200 mb-1">Name <span className="text-red-400">*</span></label>
              <input
                type="text"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                className="input w-full"
                placeholder="First Last"
                required
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-dark-200 mb-1">Email <span className="text-surface-muted">(optional)</span></label>
              <input
                type="email"
                value={guestEmail}
                onChange={(e) => setGuestEmail(e.target.value)}
                className="input w-full"
                placeholder="guest@example.com"
              />
            </div>
          </div>
          {guestError && <p className="text-sm text-red-400">{guestError}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={addingGuest} className="btn-primary btn-sm">
              {addingGuest ? "Adding..." : "Add Guest"}
            </button>
            <button type="button" onClick={() => setShowGuestForm(false)} className="btn-secondary btn-sm">
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Court Distribution Preview */}
      {checkedInCount > 0 && (
        <div className="card">
          <h3 className="text-sm font-semibold text-dark-200 mb-2">Court Distribution</h3>
          <div className="flex gap-3 flex-wrap">
            {(() => {
              try {
                const courts = distributeCourts(checkedInCount, session.num_courts);
                return courts.map((c) => (
                  <span key={c.court} className="badge-blue">
                    Court {c.court}: {c.size} players
                  </span>
                ));
              } catch {
                return <span className="text-sm text-red-400">Cannot distribute {checkedInCount} players across {session.num_courts} courts (need 4-5 per court)</span>;
              }
            })()}
          </div>
        </div>
      )}

      {seedError && (
        <div className="alert-danger p-4 text-sm">
          <strong>Seeding error:</strong> {seedError}
        </div>
      )}

      {/* Check-in Table */}
      <div className="card overflow-x-auto p-0">
        <table className="min-w-full divide-y divide-surface-border">
          <thead className="bg-surface-overlay">
            <tr>
              <th className="px-2 sm:px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-surface-muted w-12">Check-in</th>
              <th className="px-2 sm:px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-surface-muted">Name</th>
              <th className="px-2 sm:px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-surface-muted">Step</th>
              <th className="px-2 sm:px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-surface-muted">Pt %</th>
              <th className="px-2 sm:px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-surface-muted w-20">Court</th>
              {session.is_same_day_continuation && (
                <th className="px-2 sm:px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-surface-muted">Move</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border bg-surface-raised">
            {participants.map((p) => (
              <tr key={p.id} className={!p.checked_in ? "opacity-50" : ""}>
                <td className="px-2 sm:px-4 py-3">
                  <input
                    type="checkbox"
                    checked={p.checked_in}
                    onChange={() => toggleCheckIn(p.id)}
                    className="h-4 w-4 rounded border-surface-border text-brand-600 focus:ring-brand-600"
                  />
                </td>
                <td className="px-2 sm:px-4 py-3">
                  <div className="flex items-center gap-2">
                    {p.avatar_url ? (
                      <img src={p.avatar_url} alt="" className="h-7 w-7 rounded-full object-cover shrink-0" />
                    ) : (
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-900/50 text-brand-300 text-xs font-medium shrink-0">
                        {p.display_name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span className="text-sm font-medium text-dark-100">{p.display_name}</span>
                    {p.is_guest && (
                      <span className="badge-yellow text-[10px]">Guest</span>
                    )}
                  </div>
                </td>
                <td className="px-2 sm:px-4 py-3 text-sm text-dark-200">{p.current_step}</td>
                <td className="px-2 sm:px-4 py-3 text-sm text-dark-200">{p.win_pct.toFixed(1)}%</td>
                <td className="px-2 sm:px-4 py-3">
                  <input
                    type="number"
                    min={1}
                    max={session.num_courts}
                    value={p.court_number ?? ""}
                    onChange={(e) =>
                      updateCourtNumber(
                        p.id,
                        e.target.value ? parseInt(e.target.value) : null
                      )
                    }
                    className="w-12 rounded border border-surface-border bg-surface-overlay text-dark-100 text-sm py-1 px-1 text-center focus:ring-1 focus:ring-brand-600 focus:outline-none"
                    placeholder="—"
                  />
                </td>
                {session.is_same_day_continuation && (
                  <td className="px-2 sm:px-4 py-3 text-sm font-semibold whitespace-nowrap">
                    {(() => {
                      const prev = p.prev_court_number;
                      const next = p.target_court_next ?? p.court_number;
                      if (prev == null || next == null) return <span className="text-surface-muted">—</span>;
                      if (next < prev) return <span className="text-teal-300">↑ C{prev}→{next}</span>;
                      if (next > prev) return <span className="text-red-400">↓ C{prev}→{next}</span>;
                      return <span className="text-surface-muted">→ C{next}</span>;
                    })()}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
