import { requireAuth } from "@/lib/auth";
import { promoteNextWaitlistPlayer } from "@/lib/waitlist";
import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sheetId } = await params;

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    // Admins can remove any player by passing registration_id in the body.
    // Regular users can only withdraw themselves (no body needed).
    let registrationId: string | null = null;
    try {
      const body = await request.json();
      registrationId = body?.registration_id ?? null;
    } catch {
      // No body — self-withdrawal
    }

    let registration: { id: string; status: string } | null = null;

    if (registrationId && auth.profile.role === "admin") {
      // Admin removing a specific player by registration id
      const { data: reg } = await auth.supabase
        .from("registrations")
        .select("id, status")
        .eq("id", registrationId)
        .eq("sheet_id", sheetId)
        .in("status", ["confirmed", "waitlist"])
        .single();
      registration = reg ?? null;
    } else {
      // Self-withdrawal: find the caller's own registration
      const { data: reg } = await auth.supabase
        .from("registrations")
        .select("id, status")
        .eq("sheet_id", sheetId)
        .eq("player_id", auth.profile.id)
        .in("status", ["confirmed", "waitlist"])
        .single();
      registration = reg ?? null;
    }

    if (!registration) {
      return NextResponse.json(
        { error: "Registration not found" },
        { status: 404 }
      );
    }

    const wasConfirmed = registration.status === "confirmed";

    // Mark as withdrawn
    const { error: updateError } = await auth.supabase
      .from("registrations")
      .update({ status: "withdrawn" })
      .eq("id", registration.id);

    if (updateError) {
      console.error("Withdraw error:", updateError);
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }

    // If the player was confirmed, promote the highest-priority waitlisted player.
    if (wasConfirmed) {
      await promoteNextWaitlistPlayer(sheetId);
    }

    revalidatePath(`/sheets/${sheetId}`);
    revalidatePath("/sheets");

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
