import { requireAdmin } from "@/lib/auth";
import { checkAndAwardBadges } from "@/lib/badges";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/sessions/[id]/complete-round
 *
 * Called when admin advances from round_active -> round_complete.
 * 1. Validates all courts have all scores submitted
 * 2. Computes pool_finish for each player from game results
 * 3. Updates win_pct in group_memberships (rolling window)
 * 4. Calls update_steps_on_round_complete RPC (sets step_after, target_court_next)
 * 5. Advances session status to round_complete
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const { id: sessionId } = await params;

  // Fetch session
  const { data: session } = await auth.supabase
    .from("shootout_sessions")
    .select("*")
    .eq("id", sessionId)
    .single();

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  if (session.status !== "round_active") {
    return NextResponse.json({ error: "Session is not in round_active status" }, { status: 400 });
  }

  // Fetch all checked-in participants with court assignments
  const { data: participants } = await auth.supabase
    .from("session_participants")
    .select("*")
    .eq("session_id", sessionId)
    .eq("checked_in", true)
    .not("court_number", "is", null);

  if (!participants || participants.length === 0) {
    return NextResponse.json({ error: "No participants with court assignments" }, { status: 400 });
  }

  // Group participants by court
  const courtMap = new Map<number, typeof participants>();
  for (const p of participants) {
    const court = p.court_number!;
    if (!courtMap.has(court)) courtMap.set(court, []);
    courtMap.get(court)!.push(p);
  }

  // Fetch all game results for this session/round
  const { data: gameResults } = await auth.supabase
    .from("game_results")
    .select("*")
    .eq("session_id", sessionId)
    .eq("round_number", session.current_round || 1);

  if (!gameResults) {
    return NextResponse.json({ error: "Failed to fetch game results" }, { status: 500 });
  }

  // Validate all courts have all scores
  for (const [courtNum, courtPlayers] of courtMap) {
    const courtScores = gameResults.filter((g) => g.pool_number === courtNum);
    const expectedGames = courtPlayers.length === 5 ? 5 : 3;

    if (courtScores.length < expectedGames) {
      return NextResponse.json(
        { error: `Court ${courtNum} has ${courtScores.length}/${expectedGames} games submitted` },
        { status: 400 }
      );
    }
  }

  // Compute pool_finish for each court
  for (const [courtNum, courtPlayers] of courtMap) {
    const courtScores = gameResults.filter((g) => g.pool_number === courtNum);

    // Build standings: wins, point diff
    const standings = new Map<string, { wins: number; losses: number; pointDiff: number; h2hPoints: Map<string, number> }>();
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
        // Track h2h points against opponents
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

    // Sort: wins DESC -> point diff DESC -> h2h -> random
    const ranked = Array.from(standings.entries())
      .sort(([, a], [, b]) => {
        if (a.wins !== b.wins) return b.wins - a.wins;
        if (a.pointDiff !== b.pointDiff) return b.pointDiff - a.pointDiff;
        // h2h tiebreaker between these two specific players
        const aH2H = a.h2hPoints.get(Array.from(standings.entries()).find(([, v]) => v === b)?.[0] ?? "") ?? 0;
        const bH2H = b.h2hPoints.get(Array.from(standings.entries()).find(([, v]) => v === a)?.[0] ?? "") ?? 0;
        if (aH2H !== bH2H) return bH2H - aH2H;
        return Math.random() - 0.5;
      });

    // Update pool_finish for each player
    for (let i = 0; i < ranked.length; i++) {
      const [playerId] = ranked[i];
      const participant = courtPlayers.find((p) => p.player_id === playerId);
      if (participant) {
        await auth.supabase
          .from("session_participants")
          .update({ pool_finish: i + 1 })
          .eq("id", participant.id);
      }
    }
  }

  // Update win_pct for all players based on rolling window
  const { data: prefs } = await auth.supabase
    .from("group_preferences")
    .select("pct_window_sessions")
    .eq("group_id", session.group_id)
    .single();

  const windowSize = prefs?.pct_window_sessions ?? 6;

  for (const p of participants) {
    // Get all game results for this player within the rolling window of recent sessions
    // First, find the most recent N sessions for this group that this player participated in
    const { data: recentSessions } = await auth.supabase
      .from("session_participants")
      .select("session_id")
      .eq("player_id", p.player_id)
      .eq("group_id", session.group_id)
      .eq("checked_in", true)
      .order("created_at", { ascending: false })
      .limit(windowSize);

    const sessionIds = recentSessions?.map((s) => s.session_id) ?? [];
    // Include current session
    if (!sessionIds.includes(sessionId)) {
      sessionIds.unshift(sessionId);
    }

    // Fetch all game results across these sessions for this player
    const { data: playerGames } = await auth.supabase
      .from("game_results")
      .select("*")
      .in("session_id", sessionIds);

    let wins = 0;
    let losses = 0;

    for (const game of playerGames ?? []) {
      const isTeamA = game.team_a_p1 === p.player_id || game.team_a_p2 === p.player_id;
      const isTeamB = game.team_b_p1 === p.player_id || game.team_b_p2 === p.player_id;
      if (!isTeamA && !isTeamB) continue;

      const aWon = game.score_a > game.score_b;
      if ((isTeamA && aWon) || (isTeamB && !aWon)) wins++;
      else losses++;
    }

    const total = wins + losses;
    const winPct = total > 0 ? Math.round((wins / total) * 10000) / 100 : 0;

    await auth.supabase
      .from("group_memberships")
      .update({ win_pct: winPct })
      .eq("group_id", session.group_id)
      .eq("player_id", p.player_id);
  }

  // Call the existing RPC to update steps and target courts
  await auth.supabase.rpc("update_steps_on_round_complete", { p_session_id: sessionId });

  // Advance session status
  await auth.supabase
    .from("shootout_sessions")
    .update({ status: "round_complete" })
    .eq("id", sessionId);

  // Check ladder and rating badges for all participants (non-blocking)
  for (const p of participants) {
    checkAndAwardBadges(p.player_id, ["ladder", "rating"]).catch(() => {});
  }

  return NextResponse.json({ status: "round_complete" });
}
