import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sheetId } = await params;

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Optionally accept a player_id and priority in the body
    let targetPlayerId: string | null = null;
    let priority: string = "normal";
    try {
      const body = await request.json();
      targetPlayerId = body?.player_id ?? null;
      if (body?.priority && ["high", "normal", "low"].includes(body.priority)) {
        priority = body.priority;
      }
    } catch {
      // No body or invalid JSON — signing up self
    }

    // Get the caller's profile
    const { data: callerProfile } = await supabase
      .from("profiles")
      .select("id, role")
      .eq("user_id", user.id)
      .single();

    if (!callerProfile) {
      return NextResponse.json(
        { error: "Profile not found" },
        { status: 404 }
      );
    }

    // Fetch the sheet (need allow_member_guests for authorization check)
    const { data: sheet, error: sheetError } = await supabase
      .from("signup_sheets")
      .select("id, status, player_limit, signup_closes_at, allow_member_guests")
      .eq("id", sheetId)
      .single();

    if (sheetError || !sheet) {
      return NextResponse.json({ error: "Sheet not found" }, { status: 404 });
    }

    // Authorization: signing up someone else requires admin OR allow_member_guests
    const playerId = targetPlayerId || callerProfile.id;
    if (targetPlayerId && targetPlayerId !== callerProfile.id) {
      const isAdmin = callerProfile.role === "admin";
      if (!isAdmin && !sheet.allow_member_guests) {
        return NextResponse.json(
          { error: "Adding other members is not enabled for this sheet" },
          { status: 403 }
        );
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
    const { data: existing } = await supabase
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
    const { count: confirmedCount } = await supabase
      .from("registrations")
      .select("id", { count: "exact", head: true })
      .eq("sheet_id", sheetId)
      .eq("status", "confirmed");

    const status =
      (confirmedCount ?? 0) < sheet.player_limit ? "confirmed" : "waitlist";

    let waitlistPosition: number | null = null;
    if (status === "waitlist") {
      const { data: maxWl } = await supabase
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
      const { data, error } = await supabase
        .from("registrations")
        .update({
          status,
          priority,
          waitlist_position: waitlistPosition,
          signed_up_at: new Date().toISOString(),
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
      const { data, error } = await supabase
        .from("registrations")
        .insert({
          sheet_id: sheetId,
          player_id: playerId,
          status,
          priority,
          waitlist_position: waitlistPosition,
          registered_by: targetPlayerId ? callerProfile.id : null,
        })
        .select()
        .single();

      if (error) {
        console.error("Insert registration error:", error);
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      registration = data;
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
