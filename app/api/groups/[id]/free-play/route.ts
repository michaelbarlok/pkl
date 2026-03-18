import { requireAuth } from "@/lib/auth";
import { checkAndAwardBadges } from "@/lib/badges";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: groupId } = await params;

  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  // Verify caller is a member of the group
  const { data: membership } = await auth.supabase
    .from("group_memberships")
    .select("player_id")
    .eq("group_id", groupId)
    .eq("player_id", auth.profile.id)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json(
      { error: "You must be a member of this group" },
      { status: 403 }
    );
  }

  // Verify group is free_play type
  const { data: group } = await auth.supabase
    .from("shootout_groups")
    .select("group_type")
    .eq("id", groupId)
    .single();

  if (!group || group.group_type !== "free_play") {
    return NextResponse.json(
      { error: "This group does not support free play matches" },
      { status: 400 }
    );
  }

  const body = await request.json();
  const { team_a_p1, team_a_p2, team_b_p1, team_b_p2, score_a, score_b, notes } = body;

  // Validate required fields
  if (!team_a_p1 || !team_b_p1 || score_a == null || score_b == null) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 }
    );
  }

  // Validate scores are non-negative integers
  if (!Number.isInteger(score_a) || !Number.isInteger(score_b) || score_a < 0 || score_b < 0) {
    return NextResponse.json(
      { error: "Scores must be non-negative integers" },
      { status: 400 }
    );
  }

  // Validate all players are group members
  const playerIds = [team_a_p1, team_a_p2, team_b_p1, team_b_p2].filter(Boolean);
  const { data: memberCheck } = await auth.supabase
    .from("group_memberships")
    .select("player_id")
    .eq("group_id", groupId)
    .in("player_id", playerIds);

  if (!memberCheck || memberCheck.length !== playerIds.length) {
    return NextResponse.json(
      { error: "All players must be members of this group" },
      { status: 400 }
    );
  }

  const { data: match, error } = await auth.supabase
    .from("free_play_matches")
    .insert({
      group_id: groupId,
      created_by: auth.profile.id,
      team_a_p1,
      team_a_p2: team_a_p2 || null,
      team_b_p1,
      team_b_p2: team_b_p2 || null,
      score_a,
      score_b,
      notes: notes || null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Check play/winning badges for all players in the match (non-blocking)
  const allPlayerIds = [team_a_p1, team_a_p2, team_b_p1, team_b_p2].filter(Boolean) as string[];
  for (const pid of allPlayerIds) {
    checkAndAwardBadges(pid, ["play", "winning"]).catch(() => {});
  }

  return NextResponse.json(match, { status: 201 });
}
