"use client";

import { useConfirm } from "@/components/confirm-modal";
import { FirstChoiceBadge } from "@/components/first-choice-badge";
import { FormError } from "@/components/form-error";
import { useSupabase } from "@/components/providers/supabase-provider";
import { fetchWithRetry } from "@/lib/fetch-with-retry";
import { matchFirstChoice } from "@/lib/first-choice";
import { computePoolStandings, type RankedMember } from "@/lib/pool-standings";
import { expectedGamesPerCourt } from "@/lib/round-progress";
import type { ShootoutSession, SessionParticipant, ShootoutGroup, GameResult } from "@/types/database";
import { distributeCourts, rankingSheetSort, type RankedPlayer } from "@/lib/shootout-engine";
import Link from "next/link";
import { formatDate } from "@/lib/utils";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, useMemo } from "react";

type SessionWithRelations = ShootoutSession & {
  group: ShootoutGroup;
  sheet: { event_date: string; location: string };
};

const LIFECYCLE_ORDER = [
  "created",
  "checking_in",
  "seeding",
  "round_active",
  "round_complete",
  "session_complete",
] as const;

const STATUS_LABELS: Record<string, string> = {
  created: "Created",
  checking_in: "Check-In",
  seeding: "Seeding",
  round_active: "Round Active",
  round_complete: "Round Complete",
  session_complete: "Session Complete",
};

export default function AdminSessionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { supabase } = useSupabase();
  const router = useRouter();
  const confirm = useConfirm();
  const [session, setSession] = useState<SessionWithRelations | null>(null);
  const [participants, setParticipants] = useState<SessionParticipant[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [scores, setScores] = useState<GameResult[]>([]);
  const [selectedCourt, setSelectedCourt] = useState<number>(1);
  // Pre-session overall-ranking snapshot used to tiebreak standings
  // the same way the server's pool_finish recompute does. Populated
  // in loadAll below.
  const [memberRanks, setMemberRanks] = useState<Map<string, RankedMember>>(new Map());
  const [editingScore, setEditingScore] = useState<string | null>(null);
  const [editScoreA, setEditScoreA] = useState("");
  const [editScoreB, setEditScoreB] = useState("");
  const [savingScore, setSavingScore] = useState(false);
  const [enteringGame, setEnteringGame] = useState<string | null>(null);
  const [newScoreA, setNewScoreA] = useState("");
  const [newScoreB, setNewScoreB] = useState("");
  const [submittingNewScore, setSubmittingNewScore] = useState(false);
  const [newScoreError, setNewScoreError] = useState<string | null>(null);

  // Play-again flow. The court-count selector defaults to the current
  // session's count once we hit round_complete (see useEffect below) so
  // the always-visible Next Session preview has something to render.
  const [numCourtsNext, setNumCourtsNext] = useState<number | null>(null);
  const [startingNext, setStartingNext] = useState(false);

  useEffect(() => {
    async function fetch() {
      const { data: s } = await supabase
        .from("shootout_sessions")
        .select("*, group:shootout_groups(*), sheet:signup_sheets(event_date, location)")
        .eq("id", id)
        .single();
      setSession(s as SessionWithRelations);

      const { data: p } = await supabase
        .from("session_participants")
        .select("*, player:profiles(id, display_name, avatar_url)")
        .eq("session_id", id)
        .order("court_number", { ascending: true })
        .order("step_before", { ascending: true });
      setParticipants(p ?? []);

      const { data: gameScores } = await supabase
        .from("game_results")
        .select("*")
        .eq("session_id", id)
        .order("id");
      setScores(gameScores ?? []);

      // Pre-session ranking snapshot for tiebreaker annotation.
      if (p && p.length > 0 && s) {
        const groupId = (s as any).group?.id ?? (s as any).group_id;
        const playerIds = (p as any[]).map((row) => row.player_id);
        if (groupId) {
          const { data: memberships } = await supabase
            .from("group_memberships")
            .select("player_id, current_step, win_pct")
            .eq("group_id", groupId)
            .in("player_id", playerIds);
          const next = new Map<string, RankedMember>();
          for (const m of (memberships ?? []) as Array<{
            player_id: string;
            current_step: number;
            win_pct: number;
          }>) {
            next.set(m.player_id, { step: m.current_step, winPct: m.win_pct });
          }
          setMemberRanks(next);
        }
      }

      setLoading(false);
    }
    fetch();
  }, [id, supabase]);

  const [advanceError, setAdvanceError] = useState<string | null>(null);

  async function endSession() {
    if (!session) return;
    setUpdating(true);
    const res = await fetch(`/api/sessions/${id}/end`, { method: "POST" });
    if (res.ok) {
      setSession({ ...session, status: "session_complete" });
    }
    setUpdating(false);
  }

  async function startNextSession() {
    if (!session || numCourtsNext == null) return;
    setStartingNext(true);

    try {
      // Finalize the previous session through the end API. With
      // sendRecap=false the "session done" push is skipped (these
      // players are about to be re-seeded into the next session), but
      // recompute still runs if pool_finish wasn't already set — which
      // is what populates each checked-in player's target_court_next.
      // Without this step, a Play Again can inherit null targets and
      // the next session falls back to ranking-sheet seeding instead
      // of the one-up-one-down anchor.
      const endRes = await fetch(`/api/sessions/${id}/end`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sendRecap: false }),
      });
      if (!endRes.ok && endRes.status !== 400) {
        const data = await endRes.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to finalize previous session");
      }

      // Read fresh targets from the DB rather than React state — state
      // could be one realtime tick behind the recompute we just ran.
      const { data: freshParticipants } = await supabase
        .from("session_participants")
        .select("player_id, target_court_next, checked_in")
        .eq("session_id", id);

      const targetCourtMap = new Map<string, number>();
      for (const p of freshParticipants ?? []) {
        if (p.target_court_next != null) {
          targetCourtMap.set(p.player_id, p.target_court_next);
        }
      }

      // Create new session
      const { data: newSession, error: sessionErr } = await supabase
        .from("shootout_sessions")
        .insert({
          sheet_id: session.sheet_id,
          group_id: session.group_id,
          status: "created",
          num_courts: numCourtsNext,
          current_round: 0,
          is_same_day_continuation: true,
          prev_session_id: id,
        })
        .select()
        .single();

      if (sessionErr) throw sessionErr;

      // Fetch current steps from group_memberships
      const checkedInIds = (freshParticipants ?? []).filter((p) => p.checked_in).map((p) => p.player_id);
      const { data: memberships } = await supabase
        .from("group_memberships")
        .select("player_id, current_step")
        .eq("group_id", session.group_id)
        .in("player_id", checkedInIds);

      const stepMap = new Map(
        (memberships ?? []).map((m: any) => [m.player_id, m.current_step])
      );

      const newParticipants = checkedInIds.map((playerId) => ({
        session_id: newSession.id,
        group_id: session.group_id,
        player_id: playerId,
        checked_in: false,
        step_before: stepMap.get(playerId) ?? 1,
        target_court_next: targetCourtMap.get(playerId) ?? null,
      }));

      if (newParticipants.length > 0) {
        const { error: partErr } = await supabase
          .from("session_participants")
          .insert(newParticipants);
        if (partErr) throw partErr;
      }

      router.push(`/admin/sessions/${newSession.id}`);
    } catch (err) {
      setStartingNext(false);
      alert(err instanceof Error ? err.message : "Failed to start next session");
    }
  }

  async function advanceStatus() {
    if (!session) return;
    const currentIdx = LIFECYCLE_ORDER.indexOf(session.status as typeof LIFECYCLE_ORDER[number]);
    if (currentIdx >= LIFECYCLE_ORDER.length - 1) return;
    const nextStatus = LIFECYCLE_ORDER[currentIdx + 1];

    setUpdating(true);
    setAdvanceError(null);

    // round_active → round_complete: use complete-round API
    // (validates all scores, computes pool_finish, updates win_pct/steps/target_courts).
    // seeding → round_active: use /start API, which also pushes a
    // "head to Court N" notification to every checked-in player.
    if (nextStatus === "round_complete") {
      const res = await fetch(`/api/sessions/${id}/complete-round`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setAdvanceError(data.error ?? "Failed to complete round");
        setUpdating(false);
        return;
      }
    } else if (nextStatus === "round_active") {
      const res = await fetch(`/api/sessions/${id}/start`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAdvanceError(data.error ?? "Failed to start the round");
        setUpdating(false);
        return;
      }
    } else {
      await supabase
        .from("shootout_sessions")
        .update({ status: nextStatus })
        .eq("id", id);
    }

    // Re-fetch participants to pick up step_after / pool_finish changes
    const { data: refreshed } = await supabase
      .from("session_participants")
      .select("*, player:profiles(id, display_name, avatar_url)")
      .eq("session_id", id)
      .order("court_number", { ascending: true })
      .order("step_before", { ascending: true });
    if (refreshed) setParticipants(refreshed);

    // After complete-round, group_memberships current_step + win_pct have
    // moved. Refresh the rank snapshot so the next-session preview (and
    // any tiebreaker annotations) reflects the post-recompute values.
    if (nextStatus === "round_complete" && session?.group_id) {
      const playerIds = (refreshed ?? []).map((row: { player_id: string }) => row.player_id);
      if (playerIds.length > 0) {
        const { data: memberships } = await supabase
          .from("group_memberships")
          .select("player_id, current_step, win_pct")
          .eq("group_id", session.group_id)
          .in("player_id", playerIds);
        const next = new Map<string, RankedMember>();
        for (const m of (memberships ?? []) as Array<{
          player_id: string;
          current_step: number;
          win_pct: number;
        }>) {
          next.set(m.player_id, { step: m.current_step, winPct: m.win_pct });
        }
        setMemberRanks(next);
      }
    }

    setSession({ ...session, status: nextStatus });
    setUpdating(false);
  }

  // Default the next-session court count to the current session's count
  // as soon as we reach round_complete, so the always-visible preview
  // has a value to render against without forcing the admin to click.
  useEffect(() => {
    if (
      session?.status === "round_complete" &&
      numCourtsNext == null &&
      session.num_courts != null
    ) {
      setNumCourtsNext(session.num_courts);
    }
  }, [session?.status, session?.num_courts, numCourtsNext]);

  // Realtime: re-fetch participants and scores when they change
  useEffect(() => {
    const channel = supabase
      .channel(`admin-session-${id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "session_participants", filter: `session_id=eq.${id}` },
        () => {
          supabase
            .from("session_participants")
            .select("*, player:profiles(id, display_name, avatar_url)")
            .eq("session_id", id)
            .order("court_number", { ascending: true })
            .order("step_before", { ascending: true })
            .then(({ data }) => {
              if (data) setParticipants(data);
            });
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "game_results", filter: `session_id=eq.${id}` },
        (payload) => {
          setScores((prev) => [...prev, payload.new as GameResult]);
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "game_results", filter: `session_id=eq.${id}` },
        (payload) => {
          setScores((prev) =>
            prev.map((s) => (s.id === (payload.new as GameResult).id ? (payload.new as GameResult) : s))
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, supabase]);

  async function deleteSession() {
    if (!session) return;
    const ok = await confirm({
      title: "Delete this session?",
      description: "All participant data will be lost. You can start a new session from the sign-up sheet.",
      confirmLabel: "Delete Session",
      variant: "danger",
    });
    if (!ok) return;

    setDeleting(true);
    try {
      // Delete participants first, then the session
      await supabase
        .from("session_participants")
        .delete()
        .eq("session_id", id);

      await supabase
        .from("shootout_sessions")
        .delete()
        .eq("id", id);

      // Redirect back to the sheet
      if (session.sheet_id) {
        router.push(`/sheets/${session.sheet_id}`);
      } else {
        router.push("/admin/sessions");
      }
    } catch {
      setDeleting(false);
      alert("Failed to delete session.");
    }
  }

  async function saveEditedScore(gameId: string) {
    setSavingScore(true);
    const a = parseInt(editScoreA);
    const b = parseInt(editScoreB);
    if (isNaN(a) || isNaN(b) || a < 0 || b < 0) {
      setSavingScore(false);
      return;
    }
    await supabase
      .from("game_results")
      .update({ score_a: a, score_b: b })
      .eq("id", gameId);

    // Editing a score after the round is closed means pool_finish, win_pct
    // and steps are now stale — ask the server to re-derive them. For an
    // active round we still update win_pct / pool_finish but skip step
    // movement (the server decides based on session.status).
    await fetch(`/api/sessions/${id}/recompute`, { method: "POST" }).catch(() => {});

    // Refresh participants so the table shows updated pool_finish / step_after
    const { data: refreshed } = await supabase
      .from("session_participants")
      .select("*, player:profiles(id, display_name, avatar_url)")
      .eq("session_id", id)
      .order("court_number", { ascending: true })
      .order("step_before", { ascending: true });
    if (refreshed) setParticipants(refreshed);

    setEditingScore(null);
    setSavingScore(false);
  }

  async function submitNewScore(match: { team1: string[]; team2: string[] }) {
    setSubmittingNewScore(true);
    setNewScoreError(null);
    const a = parseInt(newScoreA);
    const b = parseInt(newScoreB);
    if (isNaN(a) || isNaN(b) || a < 0 || b < 0) {
      setNewScoreError("Invalid scores");
      setSubmittingNewScore(false);
      return;
    }
    // fetchWithRetry absorbs transient network/5xx failures so admin
    // entries from courtside wifi don't get dropped mid-session.
    try {
      const res = await fetchWithRetry(`/api/sessions/${id}/score`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          round_number: session?.current_round || 1,
          pool_number: selectedCourt,
          team_a_p1: match.team1[0],
          team_a_p2: match.team1[1] || null,
          team_b_p1: match.team2[0],
          team_b_p2: match.team2[1] || null,
          score_a: a,
          score_b: b,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setNewScoreError(data.error ?? "Failed to submit");
      } else {
        setEnteringGame(null);
        // If the session is already past round_active, adding a score for a
        // game that was missing needs to trigger a recompute too.
        await fetch(`/api/sessions/${id}/recompute`, { method: "POST" }).catch(() => {});
        const { data: refreshed } = await supabase
          .from("session_participants")
          .select("*, player:profiles(id, display_name, avatar_url)")
          .eq("session_id", id)
          .order("court_number", { ascending: true })
          .order("step_before", { ascending: true });
        if (refreshed) setParticipants(refreshed);
      }
    } catch {
      setNewScoreError("Network issue — please try again.");
    }
    setSubmittingNewScore(false);
  }

  // Derived data for live court view
  const courtNumbers = useMemo(() => {
    const courts = new Set(participants.filter((p) => p.court_number != null).map((p) => p.court_number!));
    return Array.from(courts).sort((a, b) => a - b);
  }, [participants]);

  const courtPlayers = useMemo(
    () => participants.filter((p) => p.court_number === selectedCourt),
    [participants, selectedCourt]
  );

  const courtScores = useMemo(
    () => scores.filter((s) => s.pool_number === selectedCourt),
    [scores, selectedCourt]
  );

  // Shared lib applies the same 5-level tiebreaker the server uses
  // for pool_finish, and annotates each standing with tiebreakerReason
  // so the UI can surface WHY a tied player got the nod.
  const courtStandings = useMemo(
    () => computePoolStandings(courtPlayers as any, courtScores, memberRanks),
    [courtPlayers, courtScores, memberRanks]
  );

  const playerNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of participants) {
      map.set(p.player_id, (p as any).player?.display_name ?? "?");
    }
    return map;
  }, [participants]);

  const playerTargetCourtMap = useMemo(() => {
    const map = new Map<string, number | null>();
    for (const p of participants) {
      map.set(p.player_id, p.target_court_next ?? null);
    }
    return map;
  }, [participants]);

  const courtMatchSchedule = useMemo(() => {
    // MUST match the ordering used by the Play tab's generateMatchSchedule
    // and the score-entry page — they both sort the player IDs before
    // assigning a/b/c/d/e. Without this sort here the admin page's
    // pairings diverge from the pairings that were actually played, so
    // the set-equality lookup below only occasionally matches a slot
    // to its DB row (G1 was the lucky one on court 2 of session
    // dc9ddfd8; G2–G5 showed "Enter score" even though the rows
    // existed).
    const playerIds = courtPlayers.map((p) => p.player_id).sort();
    const n = playerIds.length;
    if (n < 4) return [];

    const matches: { gameNumber: number; team1: string[]; team2: string[]; bye?: string }[] = [];
    if (n === 4) {
      const [a, b, c, d] = playerIds;
      matches.push(
        { gameNumber: 1, team1: [a, b], team2: [c, d] },
        { gameNumber: 2, team1: [a, c], team2: [b, d] },
        { gameNumber: 3, team1: [a, d], team2: [b, c] },
      );
    } else if (n === 5) {
      const [a, b, c, d, e] = playerIds;
      matches.push(
        { gameNumber: 1, team1: [a, b], team2: [c, d], bye: e },
        { gameNumber: 2, team1: [a, c], team2: [b, e], bye: d },
        { gameNumber: 3, team1: [b, d], team2: [a, e], bye: c },
        { gameNumber: 4, team1: [c, e], team2: [a, d], bye: b },
        { gameNumber: 5, team1: [d, e], team2: [b, c], bye: a },
      );
    }

    // Match scores
    function setsEqual(a: Set<string>, b: Set<string>): boolean {
      if (a.size !== b.size) return false;
      for (const v of a) if (!b.has(v)) return false;
      return true;
    }

    return matches.map((m) => {
      const t1Set = new Set(m.team1);
      const t2Set = new Set(m.team2);
      const found = courtScores.find((s) => {
        const sA = new Set([s.team_a_p1, s.team_a_p2].filter(Boolean) as string[]);
        const sB = new Set([s.team_b_p1, s.team_b_p2].filter(Boolean) as string[]);
        return (setsEqual(sA, t1Set) && setsEqual(sB, t2Set)) || (setsEqual(sA, t2Set) && setsEqual(sB, t1Set));
      });
      if (found) {
        const sA = new Set([found.team_a_p1, found.team_a_p2].filter(Boolean) as string[]);
        const isT1AsA = setsEqual(sA, t1Set);
        return { ...m, result: { id: found.id, scoreA: isT1AsA ? found.score_a : found.score_b, scoreB: isT1AsA ? found.score_b : found.score_a } };
      }
      return { ...m, result: undefined as { id: string; scoreA: number; scoreB: number } | undefined };
    });
  }, [courtPlayers, courtScores]);

  // Play-again preview: group checked-in players by target_court_next
  const nextCourtGroups = useMemo(() => {
    const checkedIn = participants.filter((p) => p.checked_in);
    const groups = new Map<number, typeof checkedIn>();
    for (const p of checkedIn) {
      if (p.target_court_next != null) {
        const arr = groups.get(p.target_court_next) ?? [];
        arr.push(p);
        groups.set(p.target_court_next, arr);
      }
    }
    return Array.from(groups.entries()).sort((a, b) => a[0] - b[0]);
  }, [participants]);

  const unassignedPlayers = useMemo(
    () => participants.filter((p) => p.checked_in && p.target_court_next == null),
    [participants]
  );

  const validNextCourtOptions = useMemo(() => {
    const n = participants.filter((p) => p.checked_in).length;
    return Array.from({ length: Math.floor(n / 4) }, (_, i) => i + 1).filter((c) => {
      const per = n / c;
      return per >= 4 && per <= 5;
    });
  }, [participants]);

  // Dynamic Ranking preview: predict where each checked-in player would
  // land if a new session were seeded right now. Uses post-recompute step
  // (step_after, falling back to step_before for any participant that
  // somehow doesn't have step_after yet) and the freshly-refreshed win %
  // from group_memberships. Mirrors what seedSession1 / rankingSheetSort
  // would actually do, so the admin's preview matches the real seeding.
  const dynamicRankingPreview = useMemo(() => {
    if (session?.group?.ladder_type !== "dynamic_ranking") return [];
    const checkedIn = participants.filter((p) => p.checked_in);
    if (checkedIn.length < 4) return [];

    const numCourts =
      numCourtsNext ?? session.num_courts ?? validNextCourtOptions[0] ?? 1;

    const ranked: (RankedPlayer & { _participant: typeof checkedIn[number] })[] = checkedIn.map(
      (p) => {
        const m = memberRanks.get(p.player_id);
        return {
          id: p.player_id,
          currentStep: p.step_after ?? p.step_before ?? m?.step ?? 99,
          winPct: m?.winPct ?? 0,
          lastPlayedAt: null,
          totalSessions: 0,
          _participant: p,
        };
      }
    );

    let courts;
    try {
      courts = distributeCourts(ranked.length, numCourts);
    } catch {
      return [];
    }

    const sorted = rankingSheetSort(ranked) as typeof ranked;
    const groups: Array<[number, typeof checkedIn]> = [];
    let idx = 0;
    for (const c of courts) {
      const slice = sorted.slice(idx, idx + c.size).map((r) => r._participant);
      groups.push([c.court, slice]);
      idx += c.size;
    }
    return groups;
  }, [
    participants,
    memberRanks,
    numCourtsNext,
    session?.num_courts,
    session?.group?.ladder_type,
    validNextCourtOptions,
  ]);

  const isRoundLive = session?.status === "round_active" || session?.status === "round_complete";

  if (loading) return <div className="text-center py-12 text-surface-muted">Loading...</div>;
  if (!session) return <div className="text-center py-12 text-surface-muted">Session not found.</div>;

  const currentIdx = LIFECYCLE_ORDER.indexOf(session.status as typeof LIFECYCLE_ORDER[number]);
  const checkedInCount = participants.filter((p) => p.checked_in).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-dark-100">
            Session — {session.group?.name}
          </h1>
          <p className="text-sm text-surface-muted">
            {session.sheet?.event_date && formatDate(session.sheet.event_date)}
            {" at "}
            {session.sheet?.location}
          </p>
        </div>
      </div>

      {/* Lifecycle Progress */}
      <div className="card">
        <h2 className="text-sm font-semibold text-dark-200 mb-4">Session Lifecycle</h2>
        <div className="flex flex-wrap items-center gap-2">
          {LIFECYCLE_ORDER.map((status, idx) => (
            <div key={status} className="flex items-center">
              <div
                className={`rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap ${
                  idx < currentIdx
                    ? "bg-teal-900/30 text-teal-300"
                    : idx === currentIdx
                    ? "bg-brand-900/50 text-brand-300 ring-2 ring-brand-500"
                    : "bg-surface-overlay text-surface-muted"
                }`}
              >
                {STATUS_LABELS[status]}
              </div>
              {idx < LIFECYCLE_ORDER.length - 1 && (
                <svg className="mx-1 h-4 w-4 text-surface-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Stats — compact single-line bar */}
      <div className="card py-2 px-0">
        <div className="flex items-center divide-x divide-surface-border">
          <div className="flex-1 px-4 text-center">
            <p className="text-xs text-surface-muted leading-tight">Players</p>
            <p className="text-lg font-bold text-dark-100 leading-tight">{participants.length}</p>
          </div>
          <div className="flex-1 px-4 text-center">
            <p className="text-xs text-surface-muted leading-tight">Checked In</p>
            <p className="text-lg font-bold text-dark-100 leading-tight">{checkedInCount}</p>
          </div>
          <div className="flex-1 px-4 text-center">
            <p className="text-xs text-surface-muted leading-tight">Courts</p>
            <p className="text-lg font-bold text-dark-100 leading-tight">{session.num_courts}</p>
          </div>
          <div className="flex-1 px-4 text-center">
            <p className="text-xs text-surface-muted leading-tight">Round</p>
            <p className="text-lg font-bold text-dark-100 leading-tight">{session.current_round || 1}</p>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="card">
        <h2 className="text-sm font-semibold text-dark-200 mb-4">Actions</h2>
        <div className="flex flex-wrap gap-3">
          {session.status === "created" && (
            <Link href={`/admin/sessions/${id}/checkin`} className="btn-primary">
              Start Check-In
            </Link>
          )}
          {session.status === "checking_in" && (
            <Link href={`/admin/sessions/${id}/checkin`} className="btn-primary">
              Manage Check-In
            </Link>
          )}
          {session.status === "round_complete" ? (
            <span className="text-sm text-surface-muted">
              See next-session preview below ↓
            </span>
          ) : session.status !== "session_complete" ? (
            <button onClick={advanceStatus} className="btn-secondary" disabled={updating}>
              {updating ? "Updating..." : `Advance to ${STATUS_LABELS[LIFECYCLE_ORDER[currentIdx + 1]] ?? "—"}`}
            </button>
          ) : (
            <span className="badge-green text-sm">Session Complete</span>
          )}
          <FormError message={advanceError} />
          <button
            onClick={deleteSession}
            disabled={deleting}
            className="btn-secondary !border-red-500/50 !text-red-400 hover:!bg-red-900/20"
          >
            {deleting ? "Deleting..." : "Delete Session"}
          </button>
        </div>
      </div>

      {/* Next Session Preview — always visible at round_complete so the
          admin can review who moves up vs. down before committing. For
          Court Promotion the grid is driven by target_court_next from
          the just-recomputed round (the actual one-up-one-down anchor
          the next session's seed will use). For Dynamic Ranking the
          grid is a simulation: rankingSheetSort by post-recompute step
          and win % into the same court sizes the seeder would pick.
          ↑ / ↓ pills compare each player's current court to where the
          preview puts them. */}
      {session.status === "round_complete" && (
        <div className="card space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-dark-200">Next Session Preview</h2>
            {session.group.ladder_type === "dynamic_ranking" ? (
              <p className="mt-0.5 text-xs text-surface-muted">
                <span className="font-medium text-dark-200">Dynamic Ranking</span> — courts assigned by updated step + win %. ↑/↓ shows movement vs. this round.
              </p>
            ) : (
              <p className="mt-0.5 text-xs text-surface-muted">
                Court assignments below are based on each player&apos;s finish in this round (1st up, last down).
              </p>
            )}
          </div>

          {/* Court count selector */}
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-dark-200">Courts:</label>
            <select
              value={numCourtsNext ?? ""}
              onChange={(e) => setNumCourtsNext(e.target.value ? Number(e.target.value) : null)}
              className="input w-20 py-1"
            >
              <option value="">—</option>
              {validNextCourtOptions.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            {validNextCourtOptions.length === 0 && (
              <span className="text-xs text-red-400">Not enough checked-in players</span>
            )}
          </div>

          {/* Court Promotion: target_court_next groupings (authoritative). */}
          {session.group.ladder_type !== "dynamic_ranking" && (
            <>
              {nextCourtGroups.length > 0 && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {nextCourtGroups.map(([courtNum, courtPlayers]) => (
                    <div key={courtNum} className="rounded-lg border border-surface-border bg-surface-raised p-3">
                      <p className="text-xs font-semibold text-surface-muted uppercase tracking-wider mb-2">
                        Court {courtNum}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {courtPlayers.map((p) => {
                          const prev = p.court_number;
                          const next = p.target_court_next;
                          const moved = prev != null && next != null && prev !== next
                            ? next < prev ? "up" : "down"
                            : null;
                          return (
                            <span
                              key={p.player_id}
                              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                                moved === "up"
                                  ? "bg-teal-900/40 text-teal-300"
                                  : moved === "down"
                                  ? "bg-red-900/30 text-red-400"
                                  : "bg-surface-overlay text-dark-100"
                              }`}
                            >
                              {(p as any).player?.display_name ?? "?"}
                              {moved === "up" && " ↑"}
                              {moved === "down" && " ↓"}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {unassignedPlayers.length > 0 && (
                <div>
                  <p className="text-xs text-surface-muted mb-1">No court assignment yet:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {unassignedPlayers.map((p) => (
                      <span key={p.player_id} className="badge-gray text-xs">
                        {(p as any).player?.display_name ?? "?"}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Dynamic Ranking: simulated rank-sort placement. Step + win %
              from group_memberships (refreshed post-recompute) drive the
              order. Same distributeCourts logic the seeder will use. */}
          {session.group.ladder_type === "dynamic_ranking" && (
            <>
              {dynamicRankingPreview.length > 0 && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {dynamicRankingPreview.map(([courtNum, courtPlayers]) => (
                    <div key={courtNum} className="rounded-lg border border-surface-border bg-surface-raised p-3">
                      <p className="text-xs font-semibold text-surface-muted uppercase tracking-wider mb-2">
                        Court {courtNum}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {courtPlayers.map((p) => {
                          const prev = p.court_number;
                          const moved = prev != null && prev !== courtNum
                            ? courtNum < prev ? "up" : "down"
                            : null;
                          return (
                            <span
                              key={p.player_id}
                              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                                moved === "up"
                                  ? "bg-teal-900/40 text-teal-300"
                                  : moved === "down"
                                  ? "bg-red-900/30 text-red-400"
                                  : "bg-surface-overlay text-dark-100"
                              }`}
                            >
                              {(p as any).player?.display_name ?? "?"}
                              {moved === "up" && " ↑"}
                              {moved === "down" && " ↓"}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          <div className="flex flex-wrap gap-3 pt-1">
            <button
              onClick={startNextSession}
              disabled={numCourtsNext == null || startingNext}
              className="btn-primary"
            >
              {startingNext ? "Starting..." : "Play Again"}
            </button>
            <button
              onClick={endSession}
              disabled={updating || startingNext}
              className="btn-secondary"
            >
              {updating ? "Ending..." : "End Session"}
            </button>
          </div>
        </div>
      )}

      {/* Court Details — available for any session with court assignments
           so admins can audit & edit scores even after the session closes */}
      {courtNumbers.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-semibold text-dark-100">
              {isRoundLive ? "Live Courts" : "Courts"}
            </h2>
            <select
              value={selectedCourt}
              onChange={(e) => setSelectedCourt(Number(e.target.value))}
              className="input w-auto py-1"
            >
              {courtNumbers.map((c) => (
                <option key={c} value={c}>Court {c}</option>
              ))}
            </select>
            <span className="text-xs text-surface-muted">
              {courtScores.length}/{courtPlayers.length === 5 ? 5 : 3} games
            </span>
          </div>

          {/* Standings */}
          {courtStandings.length > 0 && (
            <div className="card overflow-x-auto p-0">
              <table className="min-w-full divide-y divide-surface-border">
                <thead className="bg-surface-overlay">
                  <tr>
                    <th className="px-2 sm:px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-surface-muted w-8">#</th>
                    <th className="px-2 sm:px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-surface-muted">Player</th>
                    <th className="px-2 sm:px-4 py-2 text-center text-xs font-medium uppercase tracking-wider text-surface-muted">W</th>
                    <th className="px-2 sm:px-4 py-2 text-center text-xs font-medium uppercase tracking-wider text-surface-muted">L</th>
                    <th className="px-2 sm:px-4 py-2 text-center text-xs font-medium uppercase tracking-wider text-surface-muted">+/-</th>
                    {session.status === "round_complete" && session.group?.ladder_type !== "dynamic_ranking" && (
                      <th className="px-2 sm:px-4 py-2 text-center text-xs font-medium uppercase tracking-wider text-surface-muted">Next Court</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border bg-surface-raised">
                  {(() => {
                    const allGamesScored =
                      courtScores.length >= expectedGamesPerCourt(courtPlayers.length);
                    return courtStandings.map((s, i) => (
                    <tr key={s.playerId}>
                      <td className="px-2 sm:px-4 py-2 text-sm font-medium text-surface-muted">{i + 1}</td>
                      <td className="px-2 sm:px-4 py-2 text-sm font-medium text-dark-100">
                        <div className="flex flex-col">
                          <span>{s.displayName}</span>
                          {allGamesScored && s.tiebreakerReason && (
                            <span className="text-[11px] italic text-surface-muted">
                              Tiebreaker: {s.tiebreakerReason}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-2 sm:px-4 py-2 text-center text-sm font-semibold text-teal-300">{s.wins}</td>
                      <td className="px-2 sm:px-4 py-2 text-center text-sm font-semibold text-red-400">{s.losses}</td>
                      <td className="px-2 sm:px-4 py-2 text-center text-sm font-semibold">
                        <span className={s.pointDiff > 0 ? "text-teal-300" : s.pointDiff < 0 ? "text-red-400" : "text-surface-muted"}>
                          {s.pointDiff > 0 ? "+" : ""}{s.pointDiff}
                        </span>
                      </td>
                      {session.status === "round_complete" && session.group?.ladder_type !== "dynamic_ranking" && (
                        <td className="px-2 sm:px-4 py-2 text-center text-sm font-semibold">
                          {(() => {
                            const next = playerTargetCourtMap.get(s.playerId);
                            if (next == null) return <span className="text-surface-muted">—</span>;
                            if (next < selectedCourt) return <span className="text-teal-300">↑ {next}</span>;
                            if (next > selectedCourt) return <span className="text-red-400">↓ {next}</span>;
                            return <span className="text-surface-muted">→ {next}</span>;
                          })()}
                        </td>
                      )}
                    </tr>
                    ));
                  })()}
                </tbody>
              </table>
            </div>
          )}

          {/* Match Schedule with edit */}
          {courtMatchSchedule.length > 0 && (
            <div className="space-y-2">
              {courtMatchSchedule.map((match) => {
                const matchKey = `${selectedCourt}-${match.gameNumber}`;
                return (
                <div
                  key={match.gameNumber}
                  className={`rounded-lg px-4 py-3 ${match.result ? "bg-surface-overlay" : "bg-surface-raised border border-surface-border"}`}
                >
                  {match.result ? (
                    <>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-surface-muted">G{match.gameNumber}</span>
                        {editingScore !== match.result.id ? (
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm font-semibold text-dark-200">
                              {match.result.scoreA} – {match.result.scoreB}
                            </span>
                            <button
                              onClick={() => {
                                setEditingScore(match.result!.id);
                                setEditScoreA(String(match.result!.scoreA));
                                setEditScoreB(String(match.result!.scoreB));
                              }}
                              className="text-xs text-surface-muted hover:text-brand-300"
                              title="Edit score"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                                <path d="m5.433 13.917 1.262-3.155A4 4 0 0 1 7.58 9.42l6.92-6.918a2.121 2.121 0 0 1 3 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 0 1-.65-.65Z" />
                                <path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0 0 10 3H4.75A2.75 2.75 0 0 0 2 5.75v9.5A2.75 2.75 0 0 0 4.75 18h9.5A2.75 2.75 0 0 0 17 15.25V10a.75.75 0 0 0-1.5 0v5.25c0 .69-.56 1.25-1.25 1.25h-9.5c-.69 0-1.25-.56-1.25-1.25v-9.5Z" />
                              </svg>
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min={0}
                              value={editScoreA}
                              onChange={(e) => setEditScoreA(e.target.value)}
                              className="input w-20 py-2 text-center text-xl font-bold"
                            />
                            <span className="text-surface-muted font-bold">–</span>
                            <input
                              type="number"
                              min={0}
                              value={editScoreB}
                              onChange={(e) => setEditScoreB(e.target.value)}
                              className="input w-20 py-2 text-center text-xl font-bold"
                            />
                            <button
                              onClick={() => saveEditedScore(match.result!.id)}
                              disabled={savingScore}
                              className="btn-primary text-sm px-3 py-2"
                            >
                              {savingScore ? "…" : "Save"}
                            </button>
                            <button
                              onClick={() => setEditingScore(null)}
                              className="btn-secondary text-sm px-3 py-2"
                            >
                              Cancel
                            </button>
                          </div>
                        )}
                      </div>
                      {(() => {
                        const team1Won = match.result.scoreA > match.result.scoreB;
                        const team2Won = match.result.scoreB > match.result.scoreA;
                        return (
                          <>
                            <div className={`text-sm rounded px-2 py-0.5 -mx-2 ${team1Won ? "bg-teal-900/30 text-teal-300 font-semibold" : "text-dark-200"}`}>
                              {team1Won && <span className="mr-1">✓</span>}
                              {match.team1.map((pid) => playerNameMap.get(pid) ?? "?").join(" & ")}
                            </div>
                            <div className="text-xs text-surface-muted my-0.5 pl-2">vs</div>
                            <div className={`text-sm rounded px-2 py-0.5 -mx-2 ${team2Won ? "bg-teal-900/30 text-teal-300 font-semibold" : "text-dark-200"}`}>
                              {team2Won && <span className="mr-1">✓</span>}
                              {match.team2.map((pid) => playerNameMap.get(pid) ?? "?").join(" & ")}
                            </div>
                          </>
                        );
                      })()}
                    </>
                  ) : (
                    <>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-surface-muted">G{match.gameNumber}</span>
                        {enteringGame !== matchKey && (
                          <button
                            onClick={() => {
                              setEnteringGame(matchKey);
                              setNewScoreA("");
                              setNewScoreB("");
                            }}
                            className="text-xs text-brand-300 font-medium hover:text-brand-200"
                          >
                            Enter score &rarr;
                          </button>
                        )}
                      </div>
                      {(() => {
                        const firstChoice = matchFirstChoice(id, selectedCourt, match.gameNumber);
                        return (
                          <>
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm text-dark-100 truncate">
                                {match.team1.map((pid) => playerNameMap.get(pid) ?? "?").join(" & ")}
                              </span>
                              {firstChoice === "team1" && <FirstChoiceBadge className="shrink-0" />}
                            </div>
                            <div className="text-xs text-surface-muted my-0.5">vs</div>
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm text-dark-100 truncate">
                                {match.team2.map((pid) => playerNameMap.get(pid) ?? "?").join(" & ")}
                              </span>
                              {firstChoice === "team2" && <FirstChoiceBadge className="shrink-0" />}
                            </div>
                          </>
                        );
                      })()}
                      {enteringGame === matchKey && (
                        <div className="mt-3 space-y-3">
                          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                            <input
                              type="number"
                              min={0}
                              inputMode="numeric"
                              value={newScoreA}
                              onChange={(e) => setNewScoreA(e.target.value)}
                              className="input py-3 text-center text-2xl font-bold w-full"
                              placeholder="0"
                              autoFocus
                            />
                            <span className="text-surface-muted font-bold text-lg">–</span>
                            <input
                              type="number"
                              min={0}
                              inputMode="numeric"
                              value={newScoreB}
                              onChange={(e) => setNewScoreB(e.target.value)}
                              className="input py-3 text-center text-2xl font-bold w-full"
                              placeholder="0"
                            />
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => submitNewScore(match)}
                              disabled={submittingNewScore}
                              className="btn-primary flex-1"
                            >
                              {submittingNewScore ? "Submitting…" : "Submit Score"}
                            </button>
                            <button
                              onClick={() => setEnteringGame(null)}
                              className="btn-secondary"
                            >
                              Cancel
                            </button>
                          </div>
                          <FormError message={newScoreError} />
                        </div>
                      )}
                    </>
                  )}
                  {match.bye && (
                    <p className="mt-1">
                      {/* badge-bye reads on both themes — the raw
                          text-accent-300/80 was invisible on white. */}
                      <span className="badge-bye">
                        Bye: {playerNameMap.get(match.bye) ?? "?"}
                      </span>
                    </p>
                  )}
                </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Participants */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-dark-200">Participants</h2>

        {/* Mobile: stacked card list. Shows all the data a desktop admin
             sees, but without the horizontal scroll that was clipping
             columns on phones. */}
        <div className="space-y-2 sm:hidden">
          {participants.map((p) => {
            const ordinal = p.pool_finish != null
              ? `${p.pool_finish}${["st", "nd", "rd"][p.pool_finish - 1] ?? "th"}`
              : null;
            const stepDelta =
              p.step_after != null && p.step_before != null
                ? p.step_after - p.step_before
                : null;
            const curr = p.court_number;
            const next = p.target_court_next;
            return (
              <div key={p.id} className="card !p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="flex-1 text-sm font-medium text-dark-100">
                    {(p as any).player?.display_name ?? "Unknown"}
                  </span>
                  {p.checked_in ? (
                    <span className="badge-green">Checked in</span>
                  ) : (
                    <span className="badge-gray">Not checked in</span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                  <Stat label="Court" value={curr ?? "—"} />
                  <Stat label="Finish" value={ordinal ?? "—"} />
                  <Stat
                    label="Step"
                    value={
                      p.step_after != null ? (
                        <span className={stepDelta != null && stepDelta < 0 ? "text-teal-300 font-medium" : stepDelta != null && stepDelta > 0 ? "text-red-400 font-medium" : ""}>
                          {p.step_before} → {p.step_after}
                          {stepDelta != null && stepDelta < 0 && " ↑"}
                          {stepDelta != null && stepDelta > 0 && " ↓"}
                        </span>
                      ) : (
                        `${p.step_before}`
                      )
                    }
                  />
                  <Stat
                    label="Next court"
                    value={
                      next == null ? (
                        <span className="text-surface-muted">—</span>
                      ) : curr == null || next === curr ? (
                        <span className="text-surface-muted">→ {next}</span>
                      ) : next < curr ? (
                        <span className="text-teal-300 font-semibold">↑ {next}</span>
                      ) : (
                        <span className="text-red-400 font-semibold">↓ {next}</span>
                      )
                    }
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Desktop: full table */}
        <div className="hidden sm:block card overflow-x-auto p-0">
          <table className="min-w-full divide-y divide-surface-border">
            <thead className="bg-surface-overlay">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-surface-muted">Player</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-surface-muted">Checked In</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-surface-muted">Court</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-surface-muted">Step Before</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-surface-muted">Step After</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-surface-muted">Finish</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-surface-muted">Next Court</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border bg-surface-raised">
              {participants.map((p) => (
                <tr key={p.id}>
                  <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-dark-100">
                    {(p as any).player?.display_name ?? "Unknown"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {p.checked_in ? (
                      <span className="badge-green">Yes</span>
                    ) : (
                      <span className="badge-gray">No</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-dark-200">
                    {p.court_number ?? "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-dark-200">
                    {p.step_before}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-dark-200">
                    {p.step_after != null ? (
                      <span className={p.step_after < p.step_before ? "text-teal-300 font-medium" : p.step_after > p.step_before ? "text-red-400 font-medium" : ""}>
                        {p.step_after}
                        {p.step_after < p.step_before && " ↑"}
                        {p.step_after > p.step_before && " ↓"}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-dark-200">
                    {p.pool_finish != null ? `${p.pool_finish}${["st","nd","rd"][p.pool_finish-1] ?? "th"}` : "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm font-medium">
                    {(() => {
                      const next = p.target_court_next;
                      const curr = p.court_number;
                      if (next == null) return <span className="text-surface-muted">—</span>;
                      if (curr == null || next === curr) return <span className="text-surface-muted">→ {next}</span>;
                      if (next < curr) return <span className="text-teal-300 font-semibold">↑ Court {next}</span>;
                      return <span className="text-red-400 font-semibold">↓ Court {next}</span>;
                    })()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/** Compact label/value pair used inside the mobile participant cards. */
function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-surface-muted">{label}</p>
      <p className="text-sm text-dark-100">{value}</p>
    </div>
  );
}
