import { requireAuth } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { notify } from "@/lib/notify";
import { sheetSignupClosed } from "@/lib/sheet-lifecycle";
import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { formatDateInZone } from "@/lib/utils";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sheetId } = await params;

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    // Optionally accept a player_id, priority, and clicked_at in the body
    let targetPlayerId: string | null = null;
    let priorityOverride: string | null = null;
    let clickedAtInput: string | null = null;
    try {
      const body = await request.json();
      targetPlayerId = body?.player_id ?? null;
      if (body?.priority && ["high", "normal", "low"].includes(body.priority)) {
        priorityOverride = body.priority;
      }
      if (typeof body?.clicked_at === "string") {
        clickedAtInput = body.clicked_at;
      }
    } catch {
      // No body or invalid JSON — signing up self
    }

    // Validate the client-supplied clicked_at timestamp. It's used for
    // `signed_up_at` ordering so users are placed in line by WHEN THEY
    // CLICKED, not when the server happened to process their request.
    // We accept a clicked_at up to 2 minutes in the past (well past any
    // reasonable queue wait) and up to 5 seconds in the future (allow
    // for clock skew). Anything outside that range falls back to now()
    // inside the RPC so we can't be tricked into putting someone
    // artificially at the head of the queue.
    let clickedAtIso: string | null = null;
    if (clickedAtInput) {
      const parsed = new Date(clickedAtInput);
      const ms = parsed.getTime();
      if (!Number.isNaN(ms)) {
        const now = Date.now();
        if (ms <= now + 5_000 && ms >= now - 120_000) {
          clickedAtIso = parsed.toISOString();
        }
      }
    }

    // Fetch the sheet (need allow_member_guests for authorization check).
    // event_time is required for the "signups close at event start" cap.
    const { data: sheet, error: sheetError } = await auth.supabase
      .from("signup_sheets")
      .select("id, group_id, status, player_limit, signup_closes_at, event_time, event_date, allow_member_guests")
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

    // Determine priority: explicit override > group membership signup_priority > normal
    let priority = priorityOverride ?? "normal";
    if (!priorityOverride && sheet.group_id) {
      const checkPlayerId = targetPlayerId && targetPlayerId !== auth.profile.id
        ? targetPlayerId
        : auth.profile.id;

      const { data: membership } = await auth.supabase
        .from("group_memberships")
        .select("signup_priority")
        .eq("group_id", sheet.group_id)
        .eq("player_id", checkPlayerId)
        .maybeSingle();

      if (membership?.signup_priority) {
        priority = membership.signup_priority;
      }
    }

    if (sheet.status !== "open") {
      return NextResponse.json(
        { error: "Sheet is not open for sign-ups" },
        { status: 400 }
      );
    }

    if (sheetSignupClosed(sheet)) {
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
        p_signed_up_at: clickedAtIso,
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
        .select("event_time, timezone, group:shootout_groups(name)")
        .eq("id", sheetId)
        .single();

      const gName = (sheetGroup as { group?: { name?: string } })?.group?.name ?? "the event";
      const evTime = (sheetGroup?.event_time as string | undefined) ?? "";
      const tz = (sheetGroup?.timezone as string | undefined) ?? "America/New_York";

      notify({
        profileId: result.bumped_player_id,
        type: "bumped_to_waitlist",
        title: "Moved to waitlist",
        body: `A group admin signed up for ${gName} on ${evTime ? formatDateInZone(evTime, tz) : "the upcoming date"} using a priority spot — your confirmed registration has moved to the waitlist. You'll be notified if a spot opens up.`,
        link: `/sheets/${sheetId}`,
        emailTemplate: "BumpedToWaitlist",
        emailData: { groupName: gName, eventDate: evTime, timezone: tz, sheetId },
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
