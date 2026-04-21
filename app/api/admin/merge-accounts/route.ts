/**
 * POST /api/admin/merge-accounts
 *
 * Merges two player profiles. All records belonging to the secondary
 * profile are re-assigned to the primary profile, then the secondary
 * profile is deactivated.
 *
 * Body:
 *   primaryId: string                — kept; receives all transferred data
 *   secondaryId: string              — deactivated after the merge
 *   keepSecondaryEmail?: boolean     — when true, primary ends up with
 *     the secondary's email + auth linkage. Used when the person wants
 *     to log in with the secondary's email but keep the primary's stats.
 *   keepSecondaryAvatar?: boolean    — when true, primary ends up with
 *     the secondary's avatar_url. Stats-independent cosmetic choice.
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

    const body = await request.json() as {
      primaryId?: string;
      secondaryId?: string;
      keepSecondaryEmail?: boolean;
      keepSecondaryAvatar?: boolean;
    };
    const { primaryId, secondaryId } = body;
    const keepSecondaryEmail = body.keepSecondaryEmail === true;
    const keepSecondaryAvatar = body.keepSecondaryAvatar === true;

    if (!primaryId || !secondaryId) {
      return NextResponse.json({ error: "primaryId and secondaryId are required" }, { status: 400 });
    }
    if (primaryId === secondaryId) {
      return NextResponse.json({ error: "Cannot merge a profile with itself" }, { status: 400 });
    }

    const serviceClient = await createServiceClient();

    // Verify both profiles exist and capture the fields we'll need
    // for the optional email / avatar transfers below.
    const { data: profiles } = await serviceClient
      .from("profiles")
      .select("id, display_name, email, user_id, avatar_url")
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
    // Optional: keep secondary's avatar on the primary. Safe to apply
    // any time — no uniqueness constraints on avatar_url.
    // ----------------------------------------------------------------
    if (keepSecondaryAvatar && secondary.avatar_url) {
      await serviceClient
        .from("profiles")
        .update({ avatar_url: secondary.avatar_url })
        .eq("id", primaryId);
    }

    // ----------------------------------------------------------------
    // Optional: keep secondary's email + auth linkage on the primary.
    //
    // Both `profiles.email` and `profiles.user_id` are UNIQUE, so we
    // can't just overwrite primary with secondary's values while
    // secondary still holds them. Sequence:
    //   1. Clear secondary's email + user_id (uses a placeholder email
    //      because the column is NOT NULL).
    //   2. Copy the now-free values onto primary.
    //   3. Delete the auth user that primary *used* to own so the
    //      old email can't log back in and silently create a new
    //      profile shell.
    // ----------------------------------------------------------------
    const primaryOldUserId = primary.user_id;
    if (keepSecondaryEmail && secondary.email && secondary.user_id) {
      const placeholderEmail = `merged-${secondaryId}@placeholder.local`;

      // 1. Release secondary's unique slots.
      await serviceClient
        .from("profiles")
        .update({ user_id: null, email: placeholderEmail })
        .eq("id", secondaryId);

      // 2. Land them on primary.
      await serviceClient
        .from("profiles")
        .update({ user_id: secondary.user_id, email: secondary.email })
        .eq("id", primaryId);

      // 3. Retire primary's previous auth user (if any). We keep this
      // best-effort — if it fails (already gone, etc.) the merge is
      // still valid, the admin just has a dangling auth row.
      if (primaryOldUserId) {
        try {
          await serviceClient.auth.admin.deleteUser(primaryOldUserId);
        } catch {
          // Ignore — non-fatal to the merge.
        }
      }
    }

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
      keptSecondaryEmail: keepSecondaryEmail,
      keptSecondaryAvatar: keepSecondaryAvatar,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
