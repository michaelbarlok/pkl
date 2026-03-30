import { createServiceClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const body = await request.json();
  const { playerIds } = body as { playerIds: string[] };

  if (!Array.isArray(playerIds) || playerIds.length === 0) {
    return NextResponse.json({ error: "Missing playerIds array" }, { status: 400 });
  }

  // Prevent self-deletion
  const ids = playerIds.filter((id) => id !== auth.profile.id);
  if (ids.length === 0) {
    return NextResponse.json({ error: "Cannot delete your own account" }, { status: 400 });
  }

  const admin = await createServiceClient();

  // Fetch profiles (need user_ids for auth deletion)
  const { data: targets } = await admin
    .from("profiles")
    .select("id, user_id")
    .in("id", ids);

  if (!targets || targets.length === 0) {
    return NextResponse.json({ error: "No matching members found" }, { status: 404 });
  }

  const confirmedIds = targets.map((t) => t.id);

  try {
    // Batch all cleanup using .in() — same logic as single delete but for N players at once.

    // 1. tournament_registrations
    await admin.from("tournament_registrations").delete().in("player_id", confirmedIds);
    await admin.from("tournament_registrations").update({ partner_id: null }).in("partner_id", confirmedIds);

    // 2. tournament_matches
    await admin.from("tournament_matches").update({ player1_id: null }).in("player1_id", confirmedIds);
    await admin.from("tournament_matches").update({ player2_id: null }).in("player2_id", confirmedIds);
    await admin.from("tournament_matches").update({ winner_id: null }).in("winner_id", confirmedIds);

    // 3. free_play_matches — delete any match involving any of these players
    const idList = confirmedIds.join(",");
    await admin
      .from("free_play_matches")
      .delete()
      .or(
        `team_a_p1.in.(${idList}),team_a_p2.in.(${idList}),team_b_p1.in.(${idList}),team_b_p2.in.(${idList}),created_by.in.(${idList})`
      );

    // 4. free_play_session_players
    await admin.from("free_play_session_players").delete().in("player_id", confirmedIds);

    // 5. free_play_sessions — reassign created_by to current admin
    await admin
      .from("free_play_sessions")
      .update({ created_by: auth.profile.id })
      .in("created_by", confirmedIds);

    // 6. game_results — null out all player columns
    await Promise.all([
      admin.from("game_results").update({ team_a_p1: null }).in("team_a_p1", confirmedIds),
      admin.from("game_results").update({ team_a_p2: null }).in("team_a_p2", confirmedIds),
      admin.from("game_results").update({ team_b_p1: null }).in("team_b_p1", confirmedIds),
      admin.from("game_results").update({ team_b_p2: null }).in("team_b_p2", confirmedIds),
      admin.from("game_results").update({ confirmed_by: null }).in("confirmed_by", confirmedIds),
    ]);

    // 7. registrations — null out registered_by
    await admin.from("registrations").update({ registered_by: null }).in("registered_by", confirmedIds);

    // 8. shootout_groups / tournaments — reassign to admin
    await admin.from("shootout_groups").update({ created_by: auth.profile.id }).in("created_by", confirmedIds);
    await admin.from("tournaments").update({ created_by: auth.profile.id }).in("created_by", confirmedIds);

    // 9. Delete profiles — cascading FKs handle the rest
    const { error: deleteErr } = await admin.from("profiles").delete().in("id", confirmedIds);
    if (deleteErr) {
      return NextResponse.json(
        { error: `Failed to delete members: ${deleteErr.message}` },
        { status: 500 }
      );
    }

    // 10. Delete auth users one by one (auth admin API doesn't support bulk)
    const userIds = targets.map((t) => t.user_id).filter(Boolean) as string[];
    await Promise.all(userIds.map((uid) => admin.auth.admin.deleteUser(uid)));

    return NextResponse.json({ deleted: confirmedIds.length });
  } catch (err) {
    console.error("Bulk delete failed:", err);
    return NextResponse.json(
      { error: "An unexpected error occurred during bulk deletion" },
      { status: 500 }
    );
  }
}
