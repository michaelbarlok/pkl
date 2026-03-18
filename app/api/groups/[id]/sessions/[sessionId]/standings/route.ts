import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/groups/[id]/sessions/[sessionId]/standings
 *
 * Returns W/L records and point differential for all players
 * in the current session based on matches already saved.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; sessionId: string }> }
) {
  const { id: groupId, sessionId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get all matches for this session
  const { data: matches, error } = await supabase
    .from("free_play_matches")
    .select("team_a_p1, team_a_p2, team_b_p1, team_b_p2, score_a, score_b")
    .eq("session_id", sessionId)
    .eq("group_id", groupId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!matches?.length) {
    return NextResponse.json({ standings: [] });
  }

  // Calculate per-player: wins, losses, point differential
  const playerMap: Record<
    string,
    { wins: number; losses: number; pointDiff: number }
  > = {};

  for (const match of matches) {
    const teamAWon = match.score_a > match.score_b;
    const tie = match.score_a === match.score_b;

    // Team A players
    for (const playerId of [match.team_a_p1, match.team_a_p2]) {
      if (!playerId) continue;
      if (!playerMap[playerId])
        playerMap[playerId] = { wins: 0, losses: 0, pointDiff: 0 };
      if (tie) {
        // count ties as neither W nor L
      } else if (teamAWon) {
        playerMap[playerId].wins += 1;
      } else {
        playerMap[playerId].losses += 1;
      }
      playerMap[playerId].pointDiff += match.score_a - match.score_b;
    }

    // Team B players
    for (const playerId of [match.team_b_p1, match.team_b_p2]) {
      if (!playerId) continue;
      if (!playerMap[playerId])
        playerMap[playerId] = { wins: 0, losses: 0, pointDiff: 0 };
      if (tie) {
        // count ties as neither W nor L
      } else if (!teamAWon) {
        playerMap[playerId].wins += 1;
      } else {
        playerMap[playerId].losses += 1;
      }
      playerMap[playerId].pointDiff += match.score_b - match.score_a;
    }
  }

  // Get player profiles
  const playerIds = Object.keys(playerMap);
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url")
    .in("id", playerIds);

  const profileMap = Object.fromEntries(
    (profiles ?? []).map((p) => [p.id, p])
  );

  // Build sorted result
  const standings = playerIds
    .map((id) => ({
      playerId: id,
      displayName:
        profileMap[id]?.display_name ?? "Unknown",
      wins: playerMap[id].wins,
      losses: playerMap[id].losses,
      pointDiff: playerMap[id].pointDiff,
    }))
    .sort(
      (a, b) => b.wins - a.wins || b.pointDiff - a.pointDiff
    );

  return NextResponse.json({ standings });
}
