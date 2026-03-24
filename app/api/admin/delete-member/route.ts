import { createServiceClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const body = await request.json();
  const { playerId } = body;

  if (!playerId) {
    return NextResponse.json({ error: "Missing playerId" }, { status: 400 });
  }

  // Prevent self-deletion
  if (playerId === auth.profile.id) {
    return NextResponse.json(
      { error: "You cannot delete your own account" },
      { status: 400 }
    );
  }

  const admin = await createServiceClient();

  // Verify the member exists
  const { data: target, error: lookupErr } = await admin
    .from("profiles")
    .select("id, user_id, display_name")
    .eq("id", playerId)
    .single();

  if (lookupErr || !target) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  try {
    // Clean up non-cascading foreign key references before deleting the profile.
    // Tables with ON DELETE CASCADE are handled automatically.

    // 1. tournament_registrations — delete rows where player is registrant or partner
    await admin
      .from("tournament_registrations")
      .delete()
      .eq("player_id", playerId);
    await admin
      .from("tournament_registrations")
      .update({ partner_id: null })
      .eq("partner_id", playerId);

    // 2. tournament_matches — null out player references
    await admin
      .from("tournament_matches")
      .update({ player1_id: null })
      .eq("player1_id", playerId);
    await admin
      .from("tournament_matches")
      .update({ player2_id: null })
      .eq("player2_id", playerId);
    await admin
      .from("tournament_matches")
      .update({ winner_id: null })
      .eq("winner_id", playerId);

    // 3. free_play_matches — delete matches involving this player
    await admin
      .from("free_play_matches")
      .delete()
      .or(`team_a_p1.eq.${playerId},team_a_p2.eq.${playerId},team_b_p1.eq.${playerId},team_b_p2.eq.${playerId},created_by.eq.${playerId}`);

    // 4. free_play_session_players — delete check-ins
    await admin
      .from("free_play_session_players")
      .delete()
      .eq("player_id", playerId);

    // 5. free_play_sessions — reassign created_by to current admin, or delete if no other players
    await admin
      .from("free_play_sessions")
      .update({ created_by: auth.profile.id })
      .eq("created_by", playerId);

    // 6. game_results — null out player references
    await admin
      .from("game_results")
      .update({ team_a_p1: null })
      .eq("team_a_p1", playerId);
    await admin
      .from("game_results")
      .update({ team_a_p2: null })
      .eq("team_a_p2", playerId);
    await admin
      .from("game_results")
      .update({ team_b_p1: null })
      .eq("team_b_p1", playerId);
    await admin
      .from("game_results")
      .update({ team_b_p2: null })
      .eq("team_b_p2", playerId);
    await admin
      .from("game_results")
      .update({ confirmed_by: null })
      .eq("confirmed_by", playerId);

    // 7. registrations — null out registered_by
    await admin
      .from("registrations")
      .update({ registered_by: null })
      .eq("registered_by", playerId);

    // 8. shootout_groups — reassign created_by to current admin
    await admin
      .from("shootout_groups")
      .update({ created_by: auth.profile.id })
      .eq("created_by", playerId);

    // 9. tournaments — reassign created_by to current admin
    await admin
      .from("tournaments")
      .update({ created_by: auth.profile.id })
      .eq("created_by", playerId);

    // Now delete the profile — cascading FKs handle the rest:
    // group_memberships, registrations, session_participants, player_ratings,
    // forum_threads, forum_replies, notifications, tournament_organizers,
    // group_invites, player_badges, push_subscriptions, forum_poll_votes
    const { error: deleteErr } = await admin
      .from("profiles")
      .delete()
      .eq("id", playerId);

    if (deleteErr) {
      return NextResponse.json(
        { error: `Failed to delete member: ${deleteErr.message}` },
        { status: 500 }
      );
    }

    // Delete the auth user if they have one
    if (target.user_id) {
      await admin.auth.admin.deleteUser(target.user_id);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Failed to delete member:", err);
    return NextResponse.json(
      { error: "An unexpected error occurred while deleting the member" },
      { status: 500 }
    );
  }
}
