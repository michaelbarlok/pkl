import { requireAuth, isGroupAdmin } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

/**
 * PATCH /api/groups/[id]/sessions/[sessionId]/matches/[matchId]
 *
 * Admin-only: correct scores and/or player assignments on a
 * persisted free_play_match row.
 *
 * Body: {
 *   scoreA: number; scoreB: number;
 *   teamAP1: string; teamAP2: string;
 *   teamBP1: string; teamBP2: string;
 * }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; sessionId: string; matchId: string }> }
) {
  const { id: groupId, sessionId, matchId } = await params;

  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const canManage = await isGroupAdmin(
    auth.supabase,
    auth.profile.id,
    groupId,
    auth.profile.role
  );
  if (!canManage) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { scoreA, scoreB, teamAP1, teamAP2, teamBP1, teamBP2 } = body as {
    scoreA: number;
    scoreB: number;
    teamAP1: string;
    teamAP2: string;
    teamBP1: string;
    teamBP2: string;
  };

  if (
    typeof scoreA !== "number" || typeof scoreB !== "number" ||
    !teamAP1 || !teamAP2 || !teamBP1 || !teamBP2
  ) {
    return NextResponse.json({ error: "scoreA, scoreB, teamAP1, teamAP2, teamBP1, teamBP2 are required" }, { status: 400 });
  }

  if (scoreA < 0 || scoreB < 0) {
    return NextResponse.json({ error: "Scores cannot be negative" }, { status: 400 });
  }

  // Ensure all four player slots are distinct
  const slots = [teamAP1, teamAP2, teamBP1, teamBP2];
  if (new Set(slots).size !== 4) {
    return NextResponse.json({ error: "Each player can only appear in one slot" }, { status: 400 });
  }

  // Group-level scoring rule check on score corrections too —
  // an admin "fixing" a score still has to land on a valid finish.
  const { data: prefs } = await auth.supabase
    .from("group_preferences")
    .select("game_limit_4p, win_by_2")
    .eq("group_id", groupId)
    .maybeSingle();

  if (prefs) {
    const gameLimit = prefs.game_limit_4p;
    if (typeof gameLimit === "number" && gameLimit > 0) {
      const hi = Math.max(scoreA, scoreB);
      const lo = Math.min(scoreA, scoreB);
      if (hi < gameLimit) {
        return NextResponse.json(
          {
            error: prefs.win_by_2
              ? `At least one team must reach ${gameLimit} points (win by 2).`
              : `At least one team must reach ${gameLimit} points.`,
          },
          { status: 400 }
        );
      }
      if (prefs.win_by_2) {
        if (hi === gameLimit) {
          if (hi - lo < 2) {
            return NextResponse.json(
              { error: `Win by 2 — ${hi}-${lo} isn't a valid finish.` },
              { status: 400 }
            );
          }
        } else if (hi - lo !== 2) {
          return NextResponse.json(
            {
              error: `Win by 2 — once past ${gameLimit}, the winner must lead by exactly 2 (e.g. ${gameLimit + 1}-${gameLimit - 1}).`,
            },
            { status: 400 }
          );
        }
      } else if (hi === lo) {
        return NextResponse.json(
          { error: "Tie scores aren't allowed — someone has to win." },
          { status: 400 }
        );
      }
    }
  }

  // Verify the match belongs to this session and group
  const { data: existing } = await auth.supabase
    .from("free_play_matches")
    .select("id")
    .eq("id", matchId)
    .eq("session_id", sessionId)
    .eq("group_id", groupId)
    .single();

  if (!existing) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }

  const { data: updated, error: updateError } = await auth.supabase
    .from("free_play_matches")
    .update({
      score_a: scoreA,
      score_b: scoreB,
      team_a_p1: teamAP1,
      team_a_p2: teamAP2,
      team_b_p1: teamBP1,
      team_b_p2: teamBP2,
    })
    .eq("id", matchId)
    .select()
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json(updated);
}
