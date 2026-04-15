/**
 * POST /api/admin/merge-accounts
 *
 * Merges two player profiles. All records belonging to the secondary
 * profile are re-assigned to the primary profile, then the secondary
 * profile is deactivated.
 *
 * Body: { primaryId: string; secondaryId: string }
 *
 * Global admin only.
 */
import { requireAuth } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;
    if (auth.profile.role !== "admin") {
      return NextResponse.json({ error: "Global admin only" }, { status: 403 });
    }

    const { primaryId, secondaryId } = await request.json() as {
      primaryId?: string;
      secondaryId?: string;
    };

    if (!primaryId || !secondaryId) {
      return NextResponse.json({ error: "primaryId and secondaryId are required" }, { status: 400 });
    }
    if (primaryId === secondaryId) {
      return NextResponse.json({ error: "Cannot merge a profile with itself" }, { status: 400 });
    }

    const serviceClient = await createServiceClient();

    // Verify both profiles exist
    const { data: profiles } = await serviceClient
      .from("profiles")
      .select("id, display_name, email")
      .in("id", [primaryId, secondaryId]);

    if (!profiles || profiles.length !== 2) {
      return NextResponse.json({ error: "One or both profiles not found" }, { status: 404 });
    }

    const primary   = profiles.find((p) => p.id === primaryId)!;
    const secondary = profiles.find((p) => p.id === secondaryId)!;

    // ----------------------------------------------------------------
    // Re-assign group_memberships
    // For each group where secondary is a member:
    //   - If primary is already in that group, skip (keep primary's data)
    //   - Otherwise, update player_id to primary
    // ----------------------------------------------------------------
    const { data: secondaryMemberships } = await serviceClient
      .from("group_memberships")
      .select("group_id")
      .eq("player_id", secondaryId);

    const { data: primaryMemberships } = await serviceClient
      .from("group_memberships")
      .select("group_id")
      .eq("player_id", primaryId);

    const primaryGroupIds = new Set((primaryMemberships ?? []).map((m) => m.group_id));

    for (const m of secondaryMemberships ?? []) {
      if (primaryGroupIds.has(m.group_id)) {
        // Primary already in this group — delete secondary's record
        await serviceClient
          .from("group_memberships")
          .delete()
          .eq("group_id", m.group_id)
          .eq("player_id", secondaryId);
      } else {
        // Transfer the membership to primary
        await serviceClient
          .from("group_memberships")
          .update({ player_id: primaryId })
          .eq("group_id", m.group_id)
          .eq("player_id", secondaryId);
      }
    }

    // ----------------------------------------------------------------
    // Re-assign session_participants
    // ----------------------------------------------------------------
    await serviceClient
      .from("session_participants")
      .update({ player_id: primaryId })
      .eq("player_id", secondaryId);

    // ----------------------------------------------------------------
    // Re-assign game_results (entered_by)
    // ----------------------------------------------------------------
    await serviceClient
      .from("game_results")
      .update({ entered_by: primaryId })
      .eq("entered_by", secondaryId);

    // ----------------------------------------------------------------
    // Re-assign forum_threads
    // ----------------------------------------------------------------
    await serviceClient
      .from("forum_threads")
      .update({ author_id: primaryId })
      .eq("author_id", secondaryId);

    // ----------------------------------------------------------------
    // Re-assign forum_replies
    // ----------------------------------------------------------------
    await serviceClient
      .from("forum_replies")
      .update({ author_id: primaryId })
      .eq("author_id", secondaryId);

    // ----------------------------------------------------------------
    // Re-assign notifications
    // ----------------------------------------------------------------
    await serviceClient
      .from("notifications")
      .update({ profile_id: primaryId })
      .eq("profile_id", secondaryId);

    // ----------------------------------------------------------------
    // Re-assign pending_group_members claimed_by
    // ----------------------------------------------------------------
    await serviceClient
      .from("pending_group_members")
      .update({ claimed_by: primaryId })
      .eq("claimed_by", secondaryId);

    // ----------------------------------------------------------------
    // Deactivate secondary profile
    // ----------------------------------------------------------------
    await serviceClient
      .from("profiles")
      .update({ is_active: false })
      .eq("id", secondaryId);

    return NextResponse.json({
      message: `Merged "${secondary.display_name}" into "${primary.display_name}". Secondary account deactivated.`,
      primaryId,
      secondaryId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
