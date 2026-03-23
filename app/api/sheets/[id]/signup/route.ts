import { requireAuth } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { notify } from "@/lib/notify";
import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { formatDate } from "@/lib/utils";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sheetId } = await params;

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    // Optionally accept a player_id and priority in the body
    let targetPlayerId: string | null = null;
    let priorityOverride: string | null = null;
    try {
      const body = await request.json();
      targetPlayerId = body?.player_id ?? null;
      if (body?.priority && ["high", "normal", "low"].includes(body.priority)) {
        priorityOverride = body.priority;
      }
    } catch {
      // No body or invalid JSON — signing up self
    }

    // Fetch the sheet (need allow_member_guests for authorization check)
    const { data: sheet, error: sheetError } = await auth.supabase
      .from("signup_sheets")
      .select("id, group_id, status, player_limit, signup_closes_at, allow_member_guests")
      .eq("id", sheetId)
      .single();

    if (sheetError || !sheet) {
      return NextResponse.json({ error: "Sheet not found" }, { status: 404 });
    }

    // Authorization: signing up someone else requires admin OR allow_member_guests
    const playerId = targetPlayerId || auth.profile.id;
    if (targetPlayerId && targetPlayerId !== auth.profile.id) {
      const isAdmin = auth.profile.role === "admin";
      if (!isAdmin && !sheet.allow_member_guests) {
        return NextResponse.json(
          { error: "Adding other members is not enabled for this sheet" },
          { status: 403 }
        );
      }
    }

    // Determine priority: explicit override > auto (global admin or group admin = high) > normal
    let priority = priorityOverride ?? "normal";
    if (!priorityOverride) {
      const checkPlayerId = targetPlayerId && targetPlayerId !== auth.profile.id
        ? targetPlayerId
        : auth.profile.id;

      // Check global admin
      if (checkPlayerId === auth.profile.id && auth.profile.role === "admin") {
        priority = "high";
      } else if (checkPlayerId !== auth.profile.id) {
        const { data: targetProfile } = await auth.supabase
          .from("profiles")
          .select("role")
          .eq("id", checkPlayerId)
          .single();
        if (targetProfile?.role === "admin") priority = "high";
      }

      // Check group admin (if not already high from global admin)
      if (priority !== "high" && sheet.group_id) {
        const { data: membership } = await auth.supabase
          .from("group_memberships")
          .select("group_role")
          .eq("group_id", sheet.group_id)
          .eq("player_id", checkPlayerId)
          .single();
        if (membership?.group_role === "admin") priority = "high";
      }
    }

    if (sheet.status !== "open") {
      return NextResponse.json(
        { error: "Sheet is not open for sign-ups" },
        { status: 400 }
      );
    }

    if (new Date(sheet.signup_closes_at) < new Date()) {
      return NextResponse.json(
        { error: "Sign-up cutoff has passed" },
        { status: 400 }
      );
    }

    // All signups (normal AND high-priority) go through the atomic RPC.
    // The RPC locks the sheet row (SELECT ... FOR UPDATE) to serialize
    // concurrent signups and prevent over-confirming or duplicate bumps.
    const adminClient = await createServiceClient();
    const { data: rpcResult, error: rpcError } = await adminClient.rpc(
      "safe_signup_for_sheet",
      {
        p_sheet_id: sheetId,
        p_player_id: playerId,
        p_priority: priority,
        p_registered_by: targetPlayerId ? auth.profile.id : null,
      }
    );

    if (rpcError) {
      console.error("safe_signup_for_sheet RPC error:", rpcError);
      return NextResponse.json({ error: rpcError.message }, { status: 400 });
    }

    const result = rpcResult as {
      error?: string;
      status?: string;
      id?: string;
      already_registered?: boolean;
      waitlist_position?: number | null;
      bumped_player_id?: string | null;
    };

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    if (result.already_registered) {
      revalidatePath(`/sheets/${sheetId}`);
      revalidatePath("/sheets");
      return NextResponse.json(
        { registration: { id: result.id, status: result.status } },
        { status: 200 }
      );
    }

    // Notify the bumped player (if an admin bumped someone)
    if (result.bumped_player_id) {
      const { data: sheetGroup } = await auth.supabase
        .from("signup_sheets")
        .select("event_date, group:shootout_groups(name)")
        .eq("id", sheetId)
        .single();

      const gName = (sheetGroup as { group?: { name?: string } })?.group?.name ?? "the event";
      const evDate = sheetGroup?.event_date ?? "";

      notify({
        profileId: result.bumped_player_id,
        type: "waitlist_promoted",
        title: "Moved to waitlist",
        body: `A group admin has signed up for ${gName} on ${evDate ? formatDate(evDate) : "the upcoming date"} and your spot has been moved to the waitlist. You'll be notified if a spot opens up.`,
        link: `/sheets/${sheetId}`,
      }).catch((err) => console.error("Bump notify failed:", err));
    }

    revalidatePath(`/sheets/${sheetId}`);
    revalidatePath("/sheets");

    return NextResponse.json(
      {
        registration: {
          id: result.id,
          status: result.status,
          waitlist_position: result.waitlist_position,
        },
      },
      { status: 200 }
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
