import type { SupabaseClient } from "@supabase/supabase-js";
import { blendRollingPointPct } from "./blend-imported-win-pct";

/**
 * Re-derive a session's pool_finish + win_pct + steps from current
 * `game_results` rows. Used by:
 *
 *   - /api/sessions/[id]/complete-round   (initial round-end)
 *   - /api/sessions/[id]/recompute        (admin edited a score after
 *                                          round_complete / session_complete)
 *
 * Behavior mirrors the original complete-round flow exactly, so calling
 * it twice with unchanged scores is a no-op. Passing `onlyUpdateStats:
 * true` skips the step-movement RPC — useful when the session is active
 * and steps shouldn't move yet.
 */
export async function recomputeSessionStats(
  supabase: SupabaseClient,
  sessionId: string,
  opts: { skipSteps?: boolean } = {}
): Promise<{ ok: true } | { ok: false; error: string }> {
  // Fetch session
  const { data: session } = await supabase
    .from("shootout_sessions")
    .select("*")
    .eq("id", sessionId)
    .single();
  if (!session) return { ok: false, error: "Session not found" };

  // Checked-in participants with court assignments
  const { data: participants } = await supabase
    .from("session_participants")
    .select("*")
    .eq("session_id", sessionId)
    .eq("checked_in", true)
    .not("court_number", "is", null);
  if (!participants || participants.length === 0) {
    return { ok: false, error: "No participants with court assignments" };
  }

  // Group participants by court
  const courtMap = new Map<number, typeof participants>();
  for (const p of participants) {
    const court = p.court_number!;
    if (!courtMap.has(court)) courtMap.set(court, []);
    courtMap.get(court)!.push(p);
  }

  // All game results for this session / round
  const { data: gameResults } = await supabase
    .from("game_results")
    .select("*")
    .eq("session_id", sessionId)
    .eq("round_number", session.current_round || 1);
  if (!gameResults) return { ok: false, error: "Failed to fetch game results" };

  // Group memberships for tiebreakers AND for blending imported
  // baselines into the rolling point% below.
  const allPlayerIds = participants.map((p) => p.player_id);
  const { data: memberships } = await supabase
    .from("group_memberships")
    .select("player_id, current_step, win_pct, total_sessions, imported_win_pct")
    .eq("group_id", session.group_id)
    .in("player_id", allPlayerIds);
  type MemberRow = {
    player_id: string;
    current_step: number;
    win_pct: number;
    total_sessions: number;
    imported_win_pct: number | null;
  };
  const memberMap = new Map<string, {
    step: number;
    pointPct: number;
    totalSessions: number;
    importedWinPct: number | null;
  }>(
    (memberships ?? []).map((m: MemberRow) => [
      m.player_id,
      {
        step: m.current_step,
        pointPct: m.win_pct,
        totalSessions: m.total_sessions ?? 0,
        importedWinPct: m.imported_win_pct,
      },
    ])
  );

  // --- pool_finish per court (same algorithm as complete-round) ---
  for (const [courtNum, courtPlayers] of courtMap) {
    const courtScores = gameResults.filter((g) => g.pool_number === courtNum);

    type S = { wins: number; losses: number; pointDiff: number; h2hPoints: Map<string, number> };
    const standings = new Map<string, S>();
    for (const p of courtPlayers) {
      standings.set(p.player_id, { wins: 0, losses: 0, pointDiff: 0, h2hPoints: new Map() });
    }

    for (const game of courtScores) {
      const teamAIds = [game.team_a_p1, game.team_a_p2].filter(Boolean) as string[];
      const teamBIds = [game.team_b_p1, game.team_b_p2].filter(Boolean) as string[];
      const aWon = game.score_a > game.score_b;

      for (const pid of teamAIds) {
        const s = standings.get(pid);
        if (!s) continue;
        if (aWon) s.wins++;
        else s.losses++;
        s.pointDiff += game.score_a - game.score_b;
        for (const opp of teamBIds) {
          s.h2hPoints.set(opp, (s.h2hPoints.get(opp) ?? 0) + game.score_a);
        }
      }
      for (const pid of teamBIds) {
        const s = standings.get(pid);
        if (!s) continue;
        if (!aWon) s.wins++;
        else s.losses++;
        s.pointDiff += game.score_b - game.score_a;
        for (const opp of teamAIds) {
          s.h2hPoints.set(opp, (s.h2hPoints.get(opp) ?? 0) + game.score_b);
        }
      }
    }

    const ranked = Array.from(standings.entries()).sort(([idA, a], [idB, b]) => {
      if (a.wins !== b.wins) return b.wins - a.wins;
      if (a.pointDiff !== b.pointDiff) return b.pointDiff - a.pointDiff;
      const aH2H = a.h2hPoints.get(idB) ?? 0;
      const bH2H = b.h2hPoints.get(idA) ?? 0;
      if (aH2H !== bH2H) return bH2H - aH2H;
      const mA = memberMap.get(idA) ?? { step: 99, pointPct: 0 };
      const mB = memberMap.get(idB) ?? { step: 99, pointPct: 0 };
      if (mA.step !== mB.step) return mA.step - mB.step;
      return mB.pointPct - mA.pointPct;
    });

    for (let i = 0; i < ranked.length; i++) {
      const [playerId] = ranked[i];
      const participant = courtPlayers.find((p) => p.player_id === playerId);
      if (participant) {
        await supabase
          .from("session_participants")
          .update({ pool_finish: i + 1 })
          .eq("id", participant.id);
      }
    }
  }

  // --- win_pct (point %) per player, rolling window ---
  //
  // For each player:
  //   1. Pull game_results from their last `windowSize` real sessions.
  //   2. Sum pointsScored / pointsPossible across those games.
  //   3. If they have an imported baseline (`imported_win_pct`) and
  //      the real-session count is below the window, blend in virtual
  //      imported sessions so the imported value ages out gradually
  //      instead of being clobbered by the first real result.
  const { data: prefs } = await supabase
    .from("group_preferences")
    .select("pct_window_sessions")
    .eq("group_id", session.group_id)
    .single();
  const windowSize = prefs?.pct_window_sessions ?? 6;

  for (const p of participants) {
    const { data: recentSessions } = await supabase
      .from("session_participants")
      .select("session_id")
      .eq("player_id", p.player_id)
      .eq("group_id", session.group_id)
      .eq("checked_in", true)
      .order("created_at", { ascending: false })
      .limit(windowSize);

    const sessionIds = recentSessions?.map((s) => s.session_id) ?? [];
    if (!sessionIds.includes(sessionId)) sessionIds.unshift(sessionId);

    const { data: playerGames } = await supabase
      .from("game_results")
      .select("*")
      .in("session_id", sessionIds);

    let pointsScored = 0;
    let pointsPossible = 0;
    const sessionsWithGames = new Set<string>();
    for (const game of playerGames ?? []) {
      const isTeamA = game.team_a_p1 === p.player_id || game.team_a_p2 === p.player_id;
      const isTeamB = game.team_b_p1 === p.player_id || game.team_b_p2 === p.player_id;
      if (!isTeamA && !isTeamB) continue;
      const maxScore = Math.max(game.score_a, game.score_b);
      pointsPossible += maxScore;
      pointsScored += isTeamA ? game.score_a : game.score_b;
      sessionsWithGames.add(game.session_id);
    }

    const member = memberMap.get(p.player_id);
    const pointPct = blendRollingPointPct({
      windowSize,
      realPointsScored: pointsScored,
      realPointsPossible: pointsPossible,
      realSessionsInWindow: sessionsWithGames.size,
      // total_sessions reflects state BEFORE update_steps_on_round_complete
      // runs below, which matches the rolling-window semantics: the
      // current session counts as one of the player's real sessions
      // (we have its game_results) and the virtual borrow fills the
      // remaining window slots.
      totalSessions: member?.totalSessions ?? 0,
      importedWinPct: member?.importedWinPct ?? null,
    });

    await supabase
      .from("group_memberships")
      .update({ win_pct: pointPct })
      .eq("group_id", session.group_id)
      .eq("player_id", p.player_id);
  }

  // --- step movement + target_court_next ---
  if (!opts.skipSteps) {
    const { error: rpcError } = await supabase.rpc("update_steps_on_round_complete", {
      p_session_id: sessionId,
    });
    if (rpcError) {
      return { ok: false, error: `Failed to update player steps: ${rpcError.message}` };
    }
  }

  return { ok: true };
}
