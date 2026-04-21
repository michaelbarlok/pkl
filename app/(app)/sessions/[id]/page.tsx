"use client";

import { EmptyState } from "@/components/empty-state";
import { FirstChoiceBadge } from "@/components/first-choice-badge";
import { useSupabase } from "@/components/providers/supabase-provider";
import { matchFirstChoice } from "@/lib/first-choice";
// Pool standings + the 5-level tiebreaker live in lib/pool-standings so
// the Play tab, Admin > Sessions, and server-side pool_finish agree
// on who ranks where (and why, via tiebreakerReason).
import { computePoolStandings, type RankedMember } from "@/lib/pool-standings";
import { expectedGamesPerCourt } from "@/lib/round-progress";
import type { ShootoutSession, SessionParticipant, GameResult } from "@/types/database";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useMemo } from "react";
import { formatDate } from "@/lib/utils";
import { SESSION_STATUS_LABELS as STATUS_LABELS, SESSION_STATUS_COLORS as STATUS_COLORS } from "@/lib/status-colors";
import { ScoreEntryModal, type ScoreEntryTarget } from "./score-entry-modal";
import { SessionAdminControls } from "./session-admin-controls";

// ============================================================
// Match Schedule Generation
// ============================================================

interface ScheduledMatch {
  gameNumber: number;
  team1: string[];
  team2: string[];
  bye?: string;
  result?: { id: string; scoreA: number; scoreB: number };
}

function generateMatchSchedule(
  playerIds: string[],
  playerNames: Map<string, string>,
  scores: GameResult[]
): ScheduledMatch[] {
  playerIds = [...playerIds].sort();
  const n = playerIds.length;
  if (n < 4) return [];

  const matches: Omit<ScheduledMatch, "result">[] = [];

  if (n === 4) {
    const [a, b, c, d] = playerIds;
    matches.push(
      { gameNumber: 1, team1: [a, b], team2: [c, d] },
      { gameNumber: 2, team1: [a, c], team2: [b, d] },
      { gameNumber: 3, team1: [a, d], team2: [b, c] }
    );
  } else if (n === 5) {
    const [a, b, c, d, e] = playerIds;
    matches.push(
      { gameNumber: 1, team1: [a, b], team2: [c, d], bye: e },
      { gameNumber: 2, team1: [a, c], team2: [b, e], bye: d },
      { gameNumber: 3, team1: [b, d], team2: [a, e], bye: c },
      { gameNumber: 4, team1: [c, e], team2: [a, d], bye: b },
      { gameNumber: 5, team1: [d, e], team2: [b, c], bye: a }
    );
  }

  return (matches as ScheduledMatch[]).map((match) => {
    const t1Set = new Set(match.team1);
    const t2Set = new Set(match.team2);

    const found = scores.find((s) => {
      const sA = new Set([s.team_a_p1, s.team_a_p2].filter((v): v is string => !!v));
      const sB = new Set([s.team_b_p1, s.team_b_p2].filter((v): v is string => !!v));
      return (setsEqual(sA, t1Set) && setsEqual(sB, t2Set)) || (setsEqual(sA, t2Set) && setsEqual(sB, t1Set));
    });

    if (found) {
      const sA = new Set([found.team_a_p1, found.team_a_p2].filter((v): v is string => !!v));
      const isT1AsA = setsEqual(sA, t1Set);
      return {
        ...match,
        result: {
          id: found.id,
          scoreA: isT1AsA ? found.score_a : found.score_b,
          scoreB: isT1AsA ? found.score_b : found.score_a,
        },
      };
    }
    return match;
  });
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

function formatTeam(ids: string[], names: Map<string, string>): string {
  return ids.map((id) => names.get(id) ?? "?").join(" & ");
}

// ============================================================
// Component
// ============================================================

export default function PlayerSessionPage() {
  const { id: sessionId } = useParams<{ id: string }>();
  // When the session is opened from the /my-sessions history list, we
  // treat this page as a read-only viewer — admin score edits + the
  // full admin controls card are hidden. Admins who need to edit go
  // to /admin/sessions/[id] directly. Normal Play-tab visits (no
  // `from` param) keep the full admin affordances.
  const searchParams = useSearchParams();
  const fromHistory = searchParams.get("from") === "history";
  const { supabase } = useSupabase();
  const [session, setSession] = useState<(ShootoutSession & { group: { id: string; name: string }; sheet: { event_date: string; location: string } }) | null>(null);
  const [participants, setParticipants] = useState<(SessionParticipant & { player: { display_name: string; avatar_url: string | null } })[]>([]);
  const [scores, setScores] = useState<GameResult[]>([]);
  // Pre-session overall-ranking snapshot for every checked-in player
  // on this court. Fed into computeStandings so a pool-play tie
  // (same W / same point-diff / same H2H) gets broken by whoever
  // stood higher overall — the same rule the server uses when it
  // writes pool_finish.
  const [memberRanks, setMemberRanks] = useState<Map<string, RankedMember>>(new Map());
  const [myPlayerId, setMyPlayerId] = useState<string>("");
  const [myCourt, setMyCourt] = useState<number | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  // Inline score editing (admins only)
  const [editingScoreId, setEditingScoreId] = useState<string | null>(null);
  const [editScoreA, setEditScoreA] = useState("");
  const [editScoreB, setEditScoreB] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  // Which "other court" the viewer has opened via the dropdown. Only
  // one non-own court is shown at a time so regular members aren't
  // overwhelmed scrolling past every court's full standings.
  const [viewingOtherCourt, setViewingOtherCourt] = useState<number | null>(null);
  // Score-entry modal target. null = modal closed.
  const [entryTarget, setEntryTarget] = useState<ScoreEntryTarget | null>(null);
  // Tracks whether the viewer has dismissed the "Session started —
  // head to your court" overlay for this session. Persisted in
  // localStorage so a refresh (or visiting from a different tab)
  // doesn't re-pop the modal after they've seen it. This is the
  // fallback path for players whose push notifications are off.
  const [startedAck, setStartedAck] = useState(true);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const key = `session-started-ack:${sessionId}`;
    setStartedAck(window.localStorage.getItem(key) === "1");
  }, [sessionId]);

  // Remember what status the session was in when this tab opened so we
  // can detect an admin ending the session WHILE the user is watching.
  // Players who navigate to an already-complete session (e.g. coming
  // back to check the recap) shouldn't get the "refresh now" prompt —
  // the banner is only for mid-view transitions to session_complete.
  const initialStatusRef = useRef<string | null>(null);

  async function refetchAll() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profile } = await supabase
      .from("profiles")
      .select("id, role")
      .eq("user_id", user.id)
      .single();

    if (profile) setMyPlayerId(profile.id);

    const { data: sess } = await supabase
      .from("shootout_sessions")
      .select("*, group:shootout_groups(id, name, ladder_type), sheet:signup_sheets(event_date, location)")
      .eq("id", sessionId)
      .single();
    setSession(sess as any);
    // Snapshot the starting status exactly once per mount so the
    // "Session Complete" overlay only fires on a LIVE admin-ends
    // transition, not on loads of already-complete sessions.
    if (initialStatusRef.current === null && sess) {
      initialStatusRef.current = (sess as any).status ?? null;
    }

    // Determine admin status after we know the group
    if (profile && sess) {
      if (profile.role === "admin") {
        setIsAdmin(true);
      } else {
        const { data: mem } = await supabase
          .from("group_memberships")
          .select("group_role")
          .eq("group_id", (sess as any).group?.id ?? sess.group_id)
          .eq("player_id", profile.id)
          .maybeSingle();
        setIsAdmin(mem?.group_role === "admin");
      }
    }

    const { data: parts } = await supabase
      .from("session_participants")
      .select("*, player:profiles(display_name, avatar_url)")
      .eq("session_id", sessionId)
      .eq("checked_in", true)
      .order("court_number", { ascending: true });

    if (parts) {
      setParticipants(parts as any);
      const me = parts.find((p: any) => p.player_id === profile?.id);
      if (me) setMyCourt((me as any).court_number);
    }

    const { data: gameScores } = await supabase
      .from("game_results")
      .select("*")
      .eq("session_id", sessionId)
      .order("id");
    setScores(gameScores ?? []);

    // Pull each checked-in player's pre-session overall ranking so
    // computeStandings can tie-break by step ASC → Points % DESC
    // the same way the server's pool_finish recompute does.
    if (parts && sess) {
      const playerIds = (parts as any[]).map((p) => p.player_id);
      const groupId = (sess as any).group?.id ?? (sess as any).group_id;
      if (playerIds.length > 0 && groupId) {
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

  useEffect(() => {
    refetchAll();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, supabase]);

  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState === "visible") refetchAll();
    }
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", refetchAll);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", refetchAll);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, supabase]);

  // Realtime subscriptions
  useEffect(() => {
    const ch = supabase
      .channel(`session-${sessionId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "shootout_sessions", filter: `id=eq.${sessionId}` }, (payload) => {
        setSession((prev) => prev ? { ...prev, ...payload.new } : prev);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "session_participants", filter: `session_id=eq.${sessionId}` }, () => {
        supabase
          .from("session_participants")
          .select("*, player:profiles(display_name, avatar_url)")
          .eq("session_id", sessionId)
          .eq("checked_in", true)
          .order("court_number", { ascending: true })
          .then(({ data }) => {
            if (data) {
              setParticipants(data as any);
              const me = data.find((p: any) => p.player_id === myPlayerId);
              if (me) setMyCourt((me as any).court_number);
            }
          });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "game_results", filter: `session_id=eq.${sessionId}` }, (payload) => {
        setScores((prev) => [...prev, payload.new as GameResult]);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "game_results", filter: `session_id=eq.${sessionId}` }, (payload) => {
        setScores((prev) =>
          prev.map((s) => (s.id === (payload.new as GameResult).id ? (payload.new as GameResult) : s))
        );
      })
      .subscribe();

    return () => { supabase.removeChannel(ch); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, supabase, myPlayerId]);

  // ── Inline score edit ─────────────────────────────────────
  function startEdit(scoreId: string, currentA: number, currentB: number) {
    setEditingScoreId(scoreId);
    setEditScoreA(String(currentA));
    setEditScoreB(String(currentB));
  }

  async function saveEdit(scoreId: string) {
    const a = parseInt(editScoreA);
    const b = parseInt(editScoreB);
    if (isNaN(a) || isNaN(b) || a < 0 || b < 0) return;
    setSavingEdit(true);
    await supabase
      .from("game_results")
      .update({ score_a: a, score_b: b })
      .eq("id", scoreId);
    setScores((prev) =>
      prev.map((s) => s.id === scoreId ? { ...s, score_a: a, score_b: b } : s)
    );
    setEditingScoreId(null);
    setSavingEdit(false);
  }

  // ── Derived data ──────────────────────────────────────────
  const allCourts = useMemo(() => {
    const courts = new Set(participants.map((p) => p.court_number).filter((c): c is number => c != null));
    return Array.from(courts).sort((a, b) => a - b);
  }, [participants]);

  const playerNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of participants) map.set(p.player_id, p.player?.display_name ?? "Unknown");
    return map;
  }, [participants]);

  if (loading) return <div className="text-center py-12 text-surface-muted">Loading session...</div>;
  if (!session) return <div className="text-center py-12 text-surface-muted">Session not found.</div>;

  const isActive = session.status === "round_active" || session.status === "round_complete" || session.status === "session_complete";
  const isComplete = session.status === "session_complete";

  const ordinal = (n: number) => {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-dark-100">{session.group?.name}</h1>
        <p className="text-sm text-surface-muted">
          {session.sheet?.event_date && formatDate(session.sheet.event_date)}
          {session.sheet?.location && ` — ${session.sheet.location}`}
        </p>
      </div>

      {/* Status */}
      <div className="flex items-center gap-4">
        <span className={`inline-flex rounded-full px-3 py-1 text-sm font-medium ${STATUS_COLORS[session.status] ?? "bg-surface-overlay text-dark-200"}`}>
          {STATUS_LABELS[session.status] ?? session.status}
        </span>
        {session.num_courts > 0 && (
          <span className="text-sm text-surface-muted">{session.num_courts} courts</span>
        )}
        {isAdmin && (
          <span className="badge-admin">Admin</span>
        )}
      </div>

      {/* Matches-remaining ticker. Visible to everyone once the
           round is live so players can see progress at a glance and
           admins can gauge whether it's safe to press Complete Round.
           Expected games per court come from the same 4→3, 5→5 table
           the /complete-round API uses for validation. */}
      {(session.status === "round_active" || session.status === "round_complete") && (() => {
        const currentRound = session.current_round || 1;
        let expected = 0;
        for (const court of allCourts) {
          const count = participants.filter((p) => p.court_number === court).length;
          expected += expectedGamesPerCourt(count);
        }
        const completed = scores.filter((s) => s.round_number === currentRound).length;
        const remaining = Math.max(0, expected - completed);
        const pct = expected > 0 ? Math.round((completed / expected) * 100) : 0;
        return (
          <div className="card space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-dark-100">
                {completed} of {expected} matches played
              </p>
              <p className="text-xs text-surface-muted">
                {remaining === 0 ? "All scores in" : `${remaining} remaining`}
              </p>
            </div>
            <div
              className="h-1.5 w-full overflow-hidden rounded-full bg-surface-overlay"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={expected}
              aria-valuenow={completed}
            >
              <div
                className="h-full bg-brand-vivid transition-[width] duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })()}

      {/* Admin lifecycle + action controls. Regular players never see
           this card — it's gated on isAdmin, which covers both site
           admins and group admins (matches the add/remove rules).
           Also hidden when the page is opened from /my-sessions so
           that read-through path doesn't expose admin actions. */}
      {isAdmin && !fromHistory && (
        <SessionAdminControls
          session={session as any}
          participants={participants as any}
          onChange={refetchAll}
        />
      )}

      {/* Your Court hero (only if assigned). Colors sit on top of the
           shared surface tokens so the hero reads on both themes
           instead of vanishing against a white background.

           When the session is complete, the results (finish, W-L,
           step change, next court) render INSIDE this same card at
           the top — one card is easier to read than two stacked. */}
      {myCourt != null && (() => {
        // Compute results-only pieces lazily; they're only used when
        // isComplete is true, and null-safely skip their own rows when
        // the underlying datum isn't available.
        const me = participants.find((p) => p.player_id === myPlayerId);
        const myCourtPlayers = participants.filter((p) => p.court_number === myCourt);
        const myCourtScores = scores.filter((s) => s.pool_number === myCourt);
        const myStanding = me
          ? computePoolStandings(myCourtPlayers as any, myCourtScores, memberRanks).find(
              (s) => s.playerId === myPlayerId
            )
          : undefined;
        const finish = (me as any)?.pool_finish as number | null;
        const stepBefore = me?.step_before ?? null;
        const stepAfter = me?.step_after ?? null;
        const targetCourtNext = (me as any)?.target_court_next as number | null;
        const isCourtPromotion = (session as any).group?.ladder_type === "court_promotion";
        const stepUp = stepAfter != null && stepBefore != null && stepAfter < stepBefore;
        const stepDown = stepAfter != null && stepBefore != null && stepAfter > stepBefore;

        return (
          <div className="card bg-surface-overlay ring-1 ring-brand-vivid/40 space-y-4">
            {isComplete && (
              <div className="space-y-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-brand-vivid">
                    Your Results
                  </p>
                  <p className="text-lg font-bold text-dark-100 mt-0.5">Session Complete</p>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {finish != null && myCourt != null && (
                    <div className="rounded-lg bg-surface-raised px-3 py-2.5">
                      <p className="text-[11px] text-surface-muted uppercase tracking-wider mb-0.5">Finish</p>
                      <p className="text-xl font-bold text-dark-100">{ordinal(finish)}</p>
                      <p className="text-xs text-surface-muted">Court {myCourt}</p>
                    </div>
                  )}
                  {myStanding && (
                    <div className="rounded-lg bg-surface-raised px-3 py-2.5">
                      <p className="text-[11px] text-surface-muted uppercase tracking-wider mb-0.5">Record</p>
                      <p className="text-xl font-bold text-dark-100">
                        <span className="text-teal-500">{myStanding.wins}W</span>
                        <span className="text-surface-muted text-sm mx-0.5">–</span>
                        <span className="text-red-500">{myStanding.losses}L</span>
                      </p>
                    </div>
                  )}
                  {stepBefore != null && stepAfter != null && (
                    <div className="rounded-lg bg-surface-raised px-3 py-2.5">
                      <p className="text-[11px] text-surface-muted uppercase tracking-wider mb-0.5">Step</p>
                      <p className={`text-xl font-bold ${stepUp ? "text-teal-500" : stepDown ? "text-red-500" : "text-dark-100"}`}>
                        {stepBefore}→{stepAfter}
                        {stepUp && " ↑"}
                        {stepDown && " ↓"}
                      </p>
                    </div>
                  )}
                  {isCourtPromotion && targetCourtNext != null && myCourt != null && (
                    <div className="rounded-lg bg-surface-raised px-3 py-2.5">
                      <p className="text-[11px] text-surface-muted uppercase tracking-wider mb-0.5">Next Session</p>
                      <p className={`text-xl font-bold ${targetCourtNext < myCourt ? "text-teal-500" : targetCourtNext > myCourt ? "text-red-500" : "text-dark-100"}`}>
                        Court {targetCourtNext}
                        {targetCourtNext < myCourt && " ↑"}
                        {targetCourtNext > myCourt && " ↓"}
                        {targetCourtNext === myCourt && " →"}
                      </p>
                    </div>
                  )}
                </div>
                <div className="h-px bg-surface-border" />
              </div>
            )}

            <div>
              <p className="text-xs font-semibold uppercase tracking-wider mb-1 text-brand-vivid">Your Court</p>
              <p className="text-4xl font-bold text-dark-100">Court {myCourt}</p>
              {myCourtPlayers.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {myCourtPlayers.map((p) => {
                    const name = p.player?.display_name ?? "?";
                    const isMe = p.player_id === myPlayerId;
                    return (
                      <span
                        key={p.player_id}
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium bg-surface-raised text-dark-200 ${
                          isMe ? "ring-1 ring-brand-vivid/50" : ""
                        }`}
                      >
                        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-surface-overlay text-[9px] font-bold text-dark-100 shrink-0">
                          {name.charAt(0).toUpperCase()}
                        </span>
                        {name}
                        {isMe && <span className="text-brand-vivid">(you)</span>}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Active-session court view.
           Regular players see THEIR court fully expanded at the top,
           plus a dropdown to pop open one other court's full view at
           a time (read-only for non-admins). Admins without a court
           get the same dropdown; anything they open is editable. */}
      {isActive && allCourts.length > 0 && (() => {
        const otherCourts = allCourts.filter((c) => c !== myCourt);
        const focusedCourt = viewingOtherCourt != null && otherCourts.includes(viewingOtherCourt)
          ? viewingOtherCourt
          : null;

        const renderCourt = (courtNum: number) => {
          const courtPlayers = participants.filter((p) => p.court_number === courtNum);
          const courtScores = scores.filter((s) => s.pool_number === courtNum);
          const standings = computePoolStandings(courtPlayers as any, courtScores, memberRanks);
          const schedule = generateMatchSchedule(
            courtPlayers.map((p) => p.player_id),
            playerNames,
            courtScores
          );
          const isMyCourtSection = courtNum === myCourt;
          // A player can enter scores on their own court; admins on any
          // court. When reached via My Sessions (?from=history) the
          // whole page is read-only so even admins can't enter here.
          const canEnter = (isAdmin || isMyCourtSection) && !fromHistory;

          return (
            <div key={courtNum} className="space-y-3">
              {/* Court heading */}
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-dark-100">Court {courtNum}</h2>
                {isMyCourtSection && (
                  <span className="badge-your-court">Your Court</span>
                )}
                {isAdmin && !isMyCourtSection && (
                  <span className="badge-admin">Admin access</span>
                )}
              </div>

              {/* Players row */}
              <div className="flex flex-wrap gap-1.5">
                {courtPlayers.map((p) => {
                  const name = p.player?.display_name ?? "?";
                  const isMe = p.player_id === myPlayerId;
                  return (
                    <span
                      key={p.player_id}
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                        isMe
                          ? "bg-surface-overlay text-brand-vivid ring-1 ring-brand-vivid/40"
                          : "bg-surface-overlay text-dark-300"
                      }`}
                    >
                      {name}{isMe && " (you)"}
                    </span>
                  );
                })}
              </div>

              {/* Standings. Tiebreaker reason is only surfaced once
                   the court's full set of games has scores — before
                   that, W / +-  totals can still shift and showing a
                   tiebreaker would be misleading. */}
              {standings.length > 0 && courtScores.length > 0 && (() => {
                const allGamesScored =
                  courtScores.length >= expectedGamesPerCourt(courtPlayers.length);
                return (
                  <div className="card overflow-x-auto p-0">
                    <table className="min-w-full divide-y divide-surface-border">
                      <thead className="bg-surface-overlay">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-surface-muted w-6">#</th>
                          <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-surface-muted">Player</th>
                          <th className="px-3 py-2 text-center text-xs font-medium uppercase tracking-wider text-surface-muted">W</th>
                          <th className="px-3 py-2 text-center text-xs font-medium uppercase tracking-wider text-surface-muted">L</th>
                          <th className="px-3 py-2 text-center text-xs font-medium uppercase tracking-wider text-surface-muted">+/-</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-surface-border bg-surface-raised">
                        {standings.map((s, i) => (
                          <tr key={s.playerId} className={s.playerId === myPlayerId ? "bg-surface-overlay" : ""}>
                            <td className="px-3 py-2 text-sm text-surface-muted">{i + 1}</td>
                            <td className="px-3 py-2 text-sm font-medium text-dark-100">
                              <div className="flex flex-col">
                                <span>
                                  {s.displayName}
                                  {s.playerId === myPlayerId && <span className="ml-1 text-xs text-brand-vivid">(you)</span>}
                                </span>
                                {allGamesScored && s.tiebreakerReason && (
                                  <span className="text-[11px] italic text-surface-muted">
                                    Tiebreaker: {s.tiebreakerReason}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-2 text-center text-sm font-semibold text-teal-500">{s.wins}</td>
                            <td className="px-3 py-2 text-center text-sm font-semibold text-red-500">{s.losses}</td>
                            <td className="px-3 py-2 text-center text-sm font-semibold">
                              <span className={s.pointDiff > 0 ? "text-teal-500" : s.pointDiff < 0 ? "text-red-500" : "text-surface-muted"}>
                                {s.pointDiff > 0 ? "+" : ""}{s.pointDiff}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })()}

              {/* Match schedule */}
              {schedule.length > 0 && (
                <div className="space-y-2">
                  {schedule.map((match) => {
                    const hasResult = !!match.result;
                    const team1Won = hasResult && match.result!.scoreA > match.result!.scoreB;
                    const team2Won = hasResult && match.result!.scoreB > match.result!.scoreA;
                    const isEditingThis = editingScoreId === match.result?.id;

                    if (hasResult) {
                      return (
                        <div key={match.gameNumber} className="rounded-lg overflow-hidden ring-1 ring-surface-border">
                          <div className="flex items-center justify-between px-3 py-1.5 bg-surface-overlay border-b border-surface-border">
                            <span className="text-xs font-semibold text-surface-muted uppercase tracking-wider">Game {match.gameNumber}</span>
                            <div className="flex items-center gap-2">
                              {match.bye && <span className="badge-bye">Bye: {playerNames.get(match.bye) ?? "?"}</span>}
                              {/* Edits are suppressed when the session
                                   was reached via My Sessions — that
                                   route is a history viewer, not an
                                   admin surface. Regular Play-tab
                                   visits keep the inline Edit. */}
                              {isAdmin && !fromHistory && !isEditingThis && (
                                <button
                                  onClick={() => startEdit(match.result!.id, match.result!.scoreA, match.result!.scoreB)}
                                  className="text-xs font-medium text-brand-vivid hover:opacity-80 transition-opacity"
                                >
                                  Edit
                                </button>
                              )}
                            </div>
                          </div>

                          {isEditingThis ? (
                            /* Inline edit form */
                            <div className="bg-surface-raised px-3 py-3 space-y-3">
                              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                                <div>
                                  <label className="block text-xs text-surface-muted mb-1 truncate">{formatTeam(match.team1, playerNames)}</label>
                                  <input
                                    type="number"
                                    min={0}
                                    value={editScoreA}
                                    onChange={(e) => setEditScoreA(e.target.value)}
                                    className="input text-center w-full"
                                    autoFocus
                                  />
                                </div>
                                <span className="text-surface-muted mt-5">—</span>
                                <div>
                                  <label className="block text-xs text-surface-muted mb-1 truncate">{formatTeam(match.team2, playerNames)}</label>
                                  <input
                                    type="number"
                                    min={0}
                                    value={editScoreB}
                                    onChange={(e) => setEditScoreB(e.target.value)}
                                    className="input text-center w-full"
                                  />
                                </div>
                              </div>
                              <div className="flex gap-2 justify-end">
                                <button onClick={() => setEditingScoreId(null)} className="btn-secondary text-xs">Cancel</button>
                                <button onClick={() => saveEdit(match.result!.id)} disabled={savingEdit} className="btn-primary text-xs">
                                  {savingEdit ? "Saving…" : "Save"}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className={`flex items-center justify-between gap-2 px-3 py-2.5 ${team1Won ? "bg-surface-overlay" : "bg-surface-raised"}`}>
                                <span className={`text-sm truncate ${team1Won ? "font-semibold text-teal-500" : "text-dark-300"}`}>
                                  {team1Won && <span className="mr-1">✓</span>}
                                  {formatTeam(match.team1, playerNames)}
                                </span>
                                <span className={`font-mono text-base font-bold shrink-0 ${team1Won ? "text-teal-500" : "text-dark-300"}`}>
                                  {match.result!.scoreA}
                                </span>
                              </div>
                              <div className="h-px bg-surface-border" />
                              <div className={`flex items-center justify-between gap-2 px-3 py-2.5 ${team2Won ? "bg-surface-overlay" : "bg-surface-raised"}`}>
                                <span className={`text-sm truncate ${team2Won ? "font-semibold text-teal-500" : "text-dark-300"}`}>
                                  {team2Won && <span className="mr-1">✓</span>}
                                  {formatTeam(match.team2, playerNames)}
                                </span>
                                <span className={`font-mono text-base font-bold shrink-0 ${team2Won ? "text-teal-500" : "text-dark-300"}`}>
                                  {match.result!.scoreB}
                                </span>
                              </div>
                            </>
                          )}
                        </div>
                      );
                    }

                    const firstChoice = matchFirstChoice(sessionId, courtNum, match.gameNumber);

                    if (canEnter) {
                      // Open the in-page modal instead of navigating to
                      // /sessions/[id]/score. The modal submits to the
                      // same API and lets Realtime refresh this page.
                      return (
                        <button
                          key={match.gameNumber}
                          type="button"
                          onClick={() =>
                            setEntryTarget({
                              courtNum,
                              gameNumber: match.gameNumber,
                              team1: match.team1,
                              team2: match.team2,
                            })
                          }
                          className="w-full text-left block rounded-lg overflow-hidden ring-1 ring-surface-border hover:ring-brand-500/50 transition-all group"
                        >
                          <div className="flex items-center justify-between px-3 py-1.5 bg-surface-overlay border-b border-surface-border">
                            <span className="text-xs font-semibold text-surface-muted uppercase tracking-wider">Game {match.gameNumber}</span>
                            <span className="text-xs font-semibold text-brand-vivid group-hover:opacity-80 transition-opacity">Enter score →</span>
                          </div>
                          <div className="flex items-center justify-between gap-2 px-3 py-2.5 bg-surface-raised">
                            <span className="text-sm text-dark-200 truncate">{formatTeam(match.team1, playerNames)}</span>
                            {firstChoice === "team1" && <FirstChoiceBadge className="shrink-0" />}
                          </div>
                          <div className="h-px bg-surface-border" />
                          <div className="flex items-center justify-between gap-2 px-3 py-2.5 bg-surface-raised">
                            <span className="text-sm text-dark-200 truncate">{formatTeam(match.team2, playerNames)}</span>
                            {firstChoice === "team2" && <FirstChoiceBadge className="shrink-0" />}
                          </div>
                          {match.bye && (
                            <div className="px-3 py-1.5 bg-surface-overlay/60 border-t border-surface-border">
                              <span className="badge-bye">Bye: {playerNames.get(match.bye) ?? "?"}</span>
                            </div>
                          )}
                        </button>
                      );
                    }

                    // View-only: awaiting score (non-admin viewing someone else's court).
                    return (
                      <div key={match.gameNumber} className="rounded-lg overflow-hidden ring-1 ring-surface-border opacity-75">
                        <div className="flex items-center justify-between px-3 py-1.5 bg-surface-overlay border-b border-surface-border">
                          <span className="text-xs font-semibold text-surface-muted uppercase tracking-wider">Game {match.gameNumber}</span>
                          <span className="text-xs text-surface-muted italic">Awaiting score</span>
                        </div>
                        <div className="flex items-center justify-between gap-2 px-3 py-2.5 bg-surface-raised">
                          <span className="text-sm text-dark-300 truncate">{formatTeam(match.team1, playerNames)}</span>
                          {firstChoice === "team1" && <FirstChoiceBadge className="shrink-0" />}
                        </div>
                        <div className="h-px bg-surface-border" />
                        <div className="flex items-center justify-between gap-2 px-3 py-2.5 bg-surface-raised">
                          <span className="text-sm text-dark-300 truncate">{formatTeam(match.team2, playerNames)}</span>
                          {firstChoice === "team2" && <FirstChoiceBadge className="shrink-0" />}
                        </div>
                        {match.bye && (
                          <div className="px-3 py-1.5 bg-surface-overlay/60 border-t border-surface-border">
                            <span className="badge-bye">Bye: {playerNames.get(match.bye) ?? "?"}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        };

        return (
          <div className="space-y-6">
            {myCourt != null && renderCourt(myCourt)}

            {otherCourts.length > 0 && (
              <div className="space-y-3">
                <label className="flex items-center gap-2 text-sm text-surface-muted">
                  <span className="font-medium text-dark-200">Other courts</span>
                  <select
                    value={focusedCourt ?? ""}
                    onChange={(e) =>
                      setViewingOtherCourt(e.target.value === "" ? null : parseInt(e.target.value, 10))
                    }
                    className="input py-1 text-sm"
                  >
                    <option value="">Select a court…</option>
                    {otherCourts.map((n) => (
                      <option key={n} value={n}>
                        Court {n}
                      </option>
                    ))}
                  </select>
                </label>
                {focusedCourt != null && renderCourt(focusedCourt)}
              </div>
            )}
          </div>
        );
      })()}

      {/* Session status messages */}
      {session.status === "created" && (
        <EmptyState title="Session hasn't started yet" description="Check-in will open soon." />
      )}
      {session.status === "checking_in" && !myCourt && (
        <EmptyState title="Check-in is open" description="Please check in with the session organizer." />
      )}
      {session.status === "seeding" && (
        <EmptyState title="Courts are being assigned" description="Your court number will appear here shortly." />
      )}
      {isComplete && participants.find((p) => p.player_id === myPlayerId) == null && (
        <EmptyState
          title="Session complete"
          description="You weren't checked in for this session — there are no personal results to show."
        />
      )}

      {/* Session-ended overlay. Only shown on a LIVE transition to
           session_complete so everyone who was mid-session gets a
           deliberate "the session is over" checkpoint — the button
           hard-reloads the page so stale match rows / standings
           can't hang around on someone's phone. */}
      {initialStatusRef.current !== null &&
        initialStatusRef.current !== "session_complete" &&
        session.status === "session_complete" && (
          <div
            className="fixed inset-0 z-[250] flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="session-complete-title"
          >
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in" />
            <div className="relative z-10 w-full max-w-sm rounded-2xl bg-surface-raised shadow-2xl ring-1 ring-surface-border animate-scale-in p-6 text-center space-y-4">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full alert-success">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-6 w-6">
                  <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
                </svg>
              </div>
              <div>
                <h2 id="session-complete-title" className="text-lg font-semibold text-dark-100">
                  Session Complete
                </h2>
                <p className="mt-1 text-sm text-surface-muted">
                  The admin has ended this session. Refresh to see the final
                  results.
                </p>
              </div>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="btn-primary w-full"
              >
                Session Complete
              </button>
            </div>
          </div>
        )}

      {/* "Session Started" overlay. Fallback for players with push
           notifications off: when they open the Play tab during an
           active round, this modal tells them their court number and
           blocks the UI until they acknowledge. localStorage-keyed by
           sessionId so it shows once per session per device. Admins
           see it too but can dismiss the same way. Hidden when they
           arrived via My Sessions (fromHistory) — that's a read-only
           path and the session is long over. */}
      {!fromHistory &&
        !startedAck &&
        session.status === "round_active" &&
        myCourt != null && (
          <div
            className="fixed inset-0 z-[250] flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="session-started-title"
          >
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in" />
            <div className="relative z-10 w-full max-w-sm rounded-2xl bg-surface-raised shadow-2xl ring-1 ring-surface-border animate-scale-in p-6 text-center space-y-4">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full alert-info">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-6 w-6">
                  <path d="M10 3.75a6.25 6.25 0 1 0 0 12.5 6.25 6.25 0 0 0 0-12.5ZM1.25 10a8.75 8.75 0 1 1 17.5 0 8.75 8.75 0 0 1-17.5 0Zm9.75-3a1 1 0 1 0-2 0v3.5a1 1 0 0 0 .55.9l2.5 1.25a1 1 0 0 0 .9-1.8L11 10.38V7Z" />
                </svg>
              </div>
              <div>
                <h2 id="session-started-title" className="text-lg font-semibold text-dark-100">
                  Session Started
                </h2>
                <p className="mt-2 text-sm text-surface-muted">
                  You&apos;re on
                </p>
                <p className="mt-1 text-3xl font-bold text-brand-vivid">
                  Court {myCourt}
                </p>
                <p className="mt-2 text-sm text-surface-muted">
                  Head there now to start playing.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (typeof window !== "undefined") {
                    window.localStorage.setItem(
                      `session-started-ack:${sessionId}`,
                      "1"
                    );
                  }
                  setStartedAck(true);
                }}
                className="btn-primary w-full"
              >
                Got it
              </button>
            </div>
          </div>
        )}

      {/* Score-entry dialog. Renders nothing until a match is picked. */}
      <ScoreEntryModal
        sessionId={sessionId}
        target={entryTarget}
        currentRound={session.current_round || 1}
        playerNames={playerNames}
        onClose={() => setEntryTarget(null)}
        onSaved={refetchAll}
      />
    </div>
  );
}
