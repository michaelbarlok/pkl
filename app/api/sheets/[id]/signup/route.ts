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

    // Check for existing registration
    const { data: existing } = await auth.supabase
      .from("registrations")
      .select("id, status")
      .eq("sheet_id", sheetId)
      .eq("player_id", playerId)
      .single();

    if (existing && (existing.status === "confirmed" || existing.status === "waitlist")) {
      // Already registered — just return success
      revalidatePath(`/sheets/${sheetId}`);
      revalidatePath("/sheets");
      return NextResponse.json({ registration: existing }, { status: 200 });
    }

    // Count confirmed players
    const { count: confirmedCount } = await auth.supabase
      .from("registrations")
      .select("id", { count: "exact", head: true })
      .eq("sheet_id", sheetId)
      .eq("status", "confirmed");

    const isFull = (confirmedCount ?? 0) >= sheet.player_limit;
    let regStatus: string;
    let waitlistPosition: number | null = null;
    let bumpedPlayerId: string | null = null;
    // For high-priority players, we set signed_up_at before the earliest confirmed
    // so they appear at position #1 in the list (ordered by signed_up_at asc)
    let signedUpAt = new Date().toISOString();

    if (priority === "high") {
      // Use service client for cross-user operations
      const admin = await createServiceClient();

      // Get all confirmed registrations to find earliest timestamp
      let { data: confirmed } = await admin
        .from("registrations")
        .select("id, player_id, priority, signed_up_at")
        .eq("sheet_id", sheetId)
        .eq("status", "confirmed")
        .order("signed_up_at", { ascending: true });

      // Set signed_up_at to 1 second before the earliest confirmed player
      // so this admin always appears at position #1
      if (confirmed && confirmed.length > 0) {
        const earliest = new Date(confirmed[0].signed_up_at);
        signedUpAt = new Date(earliest.getTime() - 1000).toISOString();
      }

      if (!isFull) {
        // Sheet has room — admin gets confirmed at position #1
        regStatus = "confirmed";
      } else {
        // Sheet is full — need to bump the lowest-priority player
        const priorityOrder: Record<string, number> = { low: 0, normal: 1, high: 2 };

        // Sort: low priority first, then normal, then high
        // Within same priority, latest signup first (they get bumped first)
        const sorted = (confirmed ?? []).sort((a, b) => {
          const aPri = priorityOrder[a.priority ?? "normal"] ?? 1;
          const bPri = priorityOrder[b.priority ?? "normal"] ?? 1;
          if (aPri !== bPri) return aPri - bPri;
          return new Date(b.signed_up_at).getTime() - new Date(a.signed_up_at).getTime();
        });

        const toBump = sorted[0];

        if (toBump && (priorityOrder[toBump.priority ?? "normal"] ?? 1) < 2) {
          // Bump this player to waitlist position 1, shift others down
          const { data: currentWaitlist } = await admin
            .from("registrations")
            .select("id, waitlist_position")
            .eq("sheet_id", sheetId)
            .eq("status", "waitlist")
            .order("waitlist_position", { ascending: true });

          // Shift all existing waitlist positions up by 1 in a single query
          if (currentWaitlist && currentWaitlist.length > 0) {
            const waitlistIds = currentWaitlist.map((w) => w.id);
            const { error: rpcErr } = await admin.rpc("increment_waitlist_positions", {
              p_sheet_id: sheetId,
            });
            if (rpcErr) {
              // Fallback if RPC not deployed yet: individual updates
              for (let i = currentWaitlist.length - 1; i >= 0; i--) {
                await admin
                  .from("registrations")
                  .update({ waitlist_position: (currentWaitlist[i].waitlist_position ?? i + 1) + 1 })
                  .eq("id", currentWaitlist[i].id);
              }
            }
          }

          // Move bumped player to waitlist position 1
          await admin
            .from("registrations")
            .update({ status: "waitlist", waitlist_position: 1 })
            .eq("id", toBump.id);

          bumpedPlayerId = toBump.player_id;
          regStatus = "confirmed";
        } else {
          // All confirmed players are high priority — go to waitlist
          regStatus = "waitlist";
        }
      }
    } else if (!isFull) {
      regStatus = "confirmed";
    } else {
      regStatus = "waitlist";
    }

    if (regStatus === "waitlist") {
      const { data: maxWl } = await auth.supabase
        .from("registrations")
        .select("waitlist_position")
        .eq("sheet_id", sheetId)
        .eq("status", "waitlist")
        .order("waitlist_position", { ascending: false })
        .limit(1)
        .single();
      waitlistPosition = (maxWl?.waitlist_position ?? 0) + 1;
    }

    let registration;

    if (existing && existing.status === "withdrawn") {
      // Re-activate withdrawn registration
      const { data, error } = await auth.supabase
        .from("registrations")
        .update({
          status: regStatus,
          priority,
          waitlist_position: waitlistPosition,
          signed_up_at: signedUpAt,
        })
        .eq("id", existing.id)
        .select()
        .single();

      if (error) {
        console.error("Update registration error:", error);
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      registration = data;
    } else {
      // New registration
      const { data, error } = await auth.supabase
        .from("registrations")
        .insert({
          sheet_id: sheetId,
          player_id: playerId,
          status: regStatus,
          priority,
          waitlist_position: waitlistPosition,
          signed_up_at: signedUpAt,
          registered_by: targetPlayerId ? auth.profile.id : null,
        })
        .select()
        .single();

      if (error) {
        console.error("Insert registration error:", error);
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      registration = data;
    }

    // Notify the bumped player that they've been moved to the waitlist
    if (bumpedPlayerId) {
      // Get group name for the notification
      const { data: sheetGroup } = await auth.supabase
        .from("signup_sheets")
        .select("event_date, group:shootout_groups(name)")
        .eq("id", sheetId)
        .single();

      const gName = (sheetGroup as { group?: { name?: string } })?.group?.name ?? "the event";
      const evDate = sheetGroup?.event_date ?? "";

      notify({
        profileId: bumpedPlayerId,
        type: "waitlist_promoted",
        title: "Moved to waitlist",
        body: `A group admin has signed up for ${gName} on ${evDate ? formatDate(evDate) : "the upcoming date"} and your spot has been moved to the waitlist. You'll be notified if a spot opens up.`,
        link: `/sheets/${sheetId}`,
      }).catch((err) => console.error("Bump notify failed:", err));
    }

    revalidatePath(`/sheets/${sheetId}`);
    revalidatePath("/sheets");

    return NextResponse.json({ registration }, { status: 200 });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
