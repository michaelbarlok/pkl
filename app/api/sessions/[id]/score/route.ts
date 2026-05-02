import { requireAuth, isGroupAdmin } from "@/lib/auth";
import { checkAndAwardBadges } from "@/lib/badges";
import { validateScore } from "@/lib/score-validation";
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

  if (typeof score_a !== "number" || typeof score_b !== "number") {
    return NextResponse.json({ error: "Scores must be numbers" }, { status: 400 });
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
    const { count: poolSize } = await auth.supabase
      .from("session_participants")
      .select("*", { count: "exact", head: true })
      .eq("session_id", sessionId)
      .eq("court_number", pool_number)
      .eq("checked_in", true);

    const gameLimit = (poolSize ?? 4) >= 5 ? prefs.game_limit_5p : prefs.game_limit_4p;

    const v = validateScore({
      scoreA: score_a,
      scoreB: score_b,
      gameLimit,
      winBy2: !!prefs.win_by_2,
    });
    if (!v.ok) {
      return NextResponse.json({ error: v.error }, { status: 400 });
    }
  }

  // Enforce court membership: regular players can only submit for their own court
  const adminAccess = await isGroupAdmin(auth.supabase, auth.profile.id, session.group_id, auth.profile.role);
  if (!adminAccess) {
    const { data: myParticipant } = await auth.supabase
      .from("session_participants")
      .select("court_number")
      .eq("session_id", sessionId)
      .eq("player_id", auth.profile.id)
      .maybeSingle();

    if (!myParticipant || myParticipant.court_number !== pool_number) {
      return NextResponse.json(
        { error: "You can only submit scores for your own court" },
        { status: 403 }
      );
    }
  }

  // Check for duplicate submission in both team orders (A vs B and B vs A)
  const { data: allRoundScores } = await auth.supabase
    .from("game_results")
    .select("team_a_p1, team_a_p2, team_b_p1, team_b_p2")
    .eq("session_id", sessionId)
    .eq("round_number", round_number)
    .eq("pool_number", pool_number);

  const newTeamA = [team_a_p1, team_a_p2 ?? null].filter(Boolean).sort().join(",");
  const newTeamB = [team_b_p1, team_b_p2 ?? null].filter(Boolean).sort().join(",");
  const newMatchup = [newTeamA, newTeamB].sort().join("|");

  const isDuplicate = (allRoundScores ?? []).some((g) => {
    const existingA = [g.team_a_p1, g.team_a_p2 ?? null].filter(Boolean).sort().join(",");
    const existingB = [g.team_b_p1, g.team_b_p2 ?? null].filter(Boolean).sort().join(",");
    return [existingA, existingB].sort().join("|") === newMatchup;
  });

  if (isDuplicate) {
    return NextResponse.json(
      { error: "A score already exists for this matchup in this round" },
      { status: 409 }
    );
  }

  // Insert game result.
  //
  // The pre-check above closes the common case fast, but two teammates
  // on the same court can still tap Submit within ~200ms and both pass
  // the check before either INSERT lands. Migration 083 adds a unique
  // expression index on (session, round, pool, canonical_matchup), so
  // the second concurrent insert fails with Postgres error 23505
  // (unique_violation). We surface that as the same 409 the fast-path
  // returns — no need for a tri-state UI.
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
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "A score already exists for this matchup in this round" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Check play/winning badges for all players in the game (non-blocking)
  const playerIds = [team_a_p1, team_a_p2, team_b_p1, team_b_p2].filter(Boolean) as string[];
  for (const pid of playerIds) {
    checkAndAwardBadges(pid, ["play", "winning"]).catch((err) =>
      console.error(`Badge check failed for player ${pid}:`, err)
    );
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

/**
 * PATCH /api/sessions/[id]/score
 *
 * Edit the scores on an existing game_results row, validated against
 * the same rules as POST. Replaces the previous "direct supabase
 * update from the client" pattern that bypassed validation entirely
 * (you could enter 18-14 in a 15-point win-by-2 game).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { id: sessionId } = await params;

  const body = await request.json();
  const { game_result_id, score_a, score_b } = body as {
    game_result_id?: string;
    score_a?: number;
    score_b?: number;
  };
  if (!game_result_id) {
    return NextResponse.json({ error: "game_result_id is required" }, { status: 400 });
  }
  if (typeof score_a !== "number" || typeof score_b !== "number") {
    return NextResponse.json({ error: "Scores must be numbers" }, { status: 400 });
  }

  // Pull the row so we can scope the validation to the correct court
  // (game_limit_4p vs game_limit_5p depends on poolSize) and so the
  // session-id in the URL has to match the row.
  const { data: existing } = await auth.supabase
    .from("game_results")
    .select("id, session_id, pool_number")
    .eq("id", game_result_id)
    .maybeSingle();
  if (!existing || existing.session_id !== sessionId) {
    return NextResponse.json({ error: "Score not found" }, { status: 404 });
  }

  const { data: session } = await auth.supabase
    .from("shootout_sessions")
    .select("group_id")
    .eq("id", sessionId)
    .single();
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const { data: prefs } = await auth.supabase
    .from("group_preferences")
    .select("game_limit_4p, game_limit_5p, win_by_2")
    .eq("group_id", session.group_id)
    .single();

  if (prefs) {
    const { count: poolSize } = await auth.supabase
      .from("session_participants")
      .select("*", { count: "exact", head: true })
      .eq("session_id", sessionId)
      .eq("court_number", existing.pool_number)
      .eq("checked_in", true);
    const gameLimit = (poolSize ?? 4) >= 5 ? prefs.game_limit_5p : prefs.game_limit_4p;

    const v = validateScore({
      scoreA: score_a,
      scoreB: score_b,
      gameLimit,
      winBy2: !!prefs.win_by_2,
    });
    if (!v.ok) {
      return NextResponse.json({ error: v.error }, { status: 400 });
    }
  }

  // Permission: anyone who can submit a score for this court can edit
  // it (own court for members; any court for site admins / group
  // admins). Mirrors the POST gate.
  const adminAccess = await isGroupAdmin(
    auth.supabase,
    auth.profile.id,
    session.group_id,
    auth.profile.role,
  );
  if (!adminAccess) {
    const { data: myParticipant } = await auth.supabase
      .from("session_participants")
      .select("court_number")
      .eq("session_id", sessionId)
      .eq("player_id", auth.profile.id)
      .maybeSingle();
    if (!myParticipant || myParticipant.court_number !== existing.pool_number) {
      return NextResponse.json(
        { error: "You can only edit scores for your own court" },
        { status: 403 },
      );
    }
  }

  const { error } = await auth.supabase
    .from("game_results")
    .update({ score_a, score_b })
    .eq("id", game_result_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
