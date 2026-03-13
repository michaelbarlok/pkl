"use client";

import { useSupabase } from "@/components/providers/supabase-provider";
import { distributeCourts, seedSession1, seedSameDaySession } from "@/lib/shootout-engine";
import type { RankedPlayer, SeedablePlayer } from "@/lib/shootout-engine";
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
}

export default function CheckInPage() {
  const { id: sessionId } = useParams<{ id: string }>();
  const { supabase } = useSupabase();
  const router = useRouter();
  const [participants, setParticipants] = useState<ParticipantRow[]>([]);
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [seedError, setSeedError] = useState<string | null>(null);

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
      .select("*, player:profiles(id, display_name, avatar_url)")
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

    if (checkedIn.length === 0) {
      setSeeding(false);
      return;
    }

    try {
      let positions;

      if (session.is_same_day_continuation && session.prev_session_id) {
        // Session 2+: use previous court anchors
        const seedablePlayers: SeedablePlayer[] = checkedIn.map((p) => ({
          id: p.player_id,
          currentStep: p.current_step,
          winPct: p.win_pct,
          lastPlayedAt: p.last_played_at,
          totalSessions: p.total_sessions,
          targetCourtNext: p.target_court_next,
          seedSource: p.target_court_next != null ? "previous_court" as const : "ranking_sheet" as const,
        }));
        positions = seedSameDaySession(seedablePlayers, session.num_courts);
      } else {
        // Session 1: standard ranking sheet sort (Step ASC → Win% DESC → ...)
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

      // Update local state and sort by court number, then step
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
          return a.current_step - b.current_step;
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

  if (loading) return <div className="text-center py-12 text-surface-muted">Loading...</div>;
  if (!session) return <div className="text-center py-12 text-surface-muted">Session not found.</div>;

  const checkedInCount = participants.filter((p) => p.checked_in).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-dark-100">Check-In</h1>
          <p className="text-sm text-surface-muted">
            {session.group?.name} — {checkedInCount} / {participants.length} checked in
          </p>
        </div>
        <div className="flex gap-3">
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
        <div className="rounded-md bg-red-900/30 border border-red-500/30 p-4 text-red-300 text-sm">
          <strong>Seeding error:</strong> {seedError}
        </div>
      )}

      {/* Check-in Table */}
      <div className="card overflow-hidden p-0">
        <table className="min-w-full divide-y divide-surface-border">
          <thead className="bg-surface-overlay">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-surface-muted w-12">Check-in</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-surface-muted">Name</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-surface-muted">Step</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-surface-muted">Win %</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-surface-muted w-24">Court</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border bg-surface-raised">
            {participants.map((p) => (
              <tr key={p.id} className={!p.checked_in ? "opacity-50" : ""}>
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={p.checked_in}
                    onChange={() => toggleCheckIn(p.id)}
                    className="h-4 w-4 rounded border-surface-border text-brand-600 focus:ring-brand-600"
                  />
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {p.avatar_url ? (
                      <img src={p.avatar_url} alt="" className="h-7 w-7 rounded-full object-cover" />
                    ) : (
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-900/50 text-brand-300 text-xs font-medium">
                        {p.display_name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span className="text-sm font-medium text-dark-100">{p.display_name}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-dark-200">{p.current_step}</td>
                <td className="px-4 py-3 text-sm text-dark-200">{p.win_pct.toFixed(1)}%</td>
                <td className="px-4 py-3">
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
                    className="w-16 rounded border border-surface-border bg-surface-overlay text-dark-100 text-sm py-1 px-2 text-center focus:ring-1 focus:ring-brand-600 focus:outline-none"
                    placeholder="—"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
