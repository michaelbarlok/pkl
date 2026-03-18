import { requireAuth } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const { id: sessionId } = await params;
  const body = await request.json();
  const {
    round_number,
    pool_number,
    team_a_p1,
    team_a_p2,
    team_b_p1,
    team_b_p2,
    score_a,
    score_b,
  } = body;

  // Validate scores
  if (typeof score_a !== "number" || typeof score_b !== "number") {
    return NextResponse.json({ error: "Scores must be numbers" }, { status: 400 });
  }
  if (score_a < 0 || score_b < 0) {
    return NextResponse.json({ error: "Scores must be non-negative" }, { status: 400 });
  }

  // Fetch session and group preferences for validation
  const { data: session } = await auth.supabase
    .from("shootout_sessions")
    .select("*, group:shootout_groups(id)")
    .eq("id", sessionId)
    .single();

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const { data: prefs } = await auth.supabase
    .from("group_preferences")
    .select("*")
    .eq("group_id", session.group_id)
    .single();

  if (prefs) {
    // Determine game limit based on how many players are on the court (not in the game)
    const { count: poolSize } = await auth.supabase
      .from("session_participants")
      .select("*", { count: "exact", head: true })
      .eq("session_id", sessionId)
      .eq("court_number", pool_number)
      .eq("checked_in", true);

    const gameLimit = (poolSize ?? 4) >= 5 ? prefs.game_limit_5p : prefs.game_limit_4p;

    // At least one team must reach the game limit
    if (score_a < gameLimit && score_b < gameLimit) {
      return NextResponse.json(
        { error: `At least one team must reach ${gameLimit} points` },
        { status: 400 }
      );
    }

    // Win-by-2 rule
    if (prefs.win_by_2 && Math.abs(score_a - score_b) < 2) {
      return NextResponse.json(
        { error: "Win-by-2 rule requires at least 2 point difference" },
        { status: 400 }
      );
    }
  }

  // Check for duplicate submission (must match full team composition)
  let dupQuery = auth.supabase
    .from("game_results")
    .select("id")
    .eq("session_id", sessionId)
    .eq("round_number", round_number)
    .eq("pool_number", pool_number)
    .eq("team_a_p1", team_a_p1)
    .eq("team_b_p1", team_b_p1);

  if (team_a_p2) {
    dupQuery = dupQuery.eq("team_a_p2", team_a_p2);
  } else {
    dupQuery = dupQuery.is("team_a_p2", null);
  }
  if (team_b_p2) {
    dupQuery = dupQuery.eq("team_b_p2", team_b_p2);
  } else {
    dupQuery = dupQuery.is("team_b_p2", null);
  }

  const { data: existing } = await dupQuery.limit(1);

  if (existing && existing.length > 0) {
    return NextResponse.json(
      { error: "A score already exists for this matchup in this round" },
      { status: 409 }
    );
  }

  // Insert game result
  const { data: result, error } = await auth.supabase
    .from("game_results")
    .insert({
      session_id: sessionId,
      group_id: session.group_id,
      round_number,
      pool_number,
      team_a_p1,
      team_a_p2: team_a_p2 || null,
      team_b_p1,
      team_b_p2: team_b_p2 || null,
      score_a,
      score_b,
      entered_by: auth.profile.id,
      is_confirmed: false,
      is_disputed: false,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(result);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const body = await request.json();
  const { game_result_id, confirmed_by, is_disputed } = body;

  if (is_disputed) {
    // Flag for admin resolution
    const { error } = await auth.supabase
      .from("game_results")
      .update({ is_disputed: true })
      .eq("id", game_result_id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ status: "disputed" });
  }

  // Confirm score
  const { error } = await auth.supabase
    .from("game_results")
    .update({
      is_confirmed: true,
      confirmed_by: auth.profile.id,
    })
    .eq("id", game_result_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ status: "confirmed" });
}
