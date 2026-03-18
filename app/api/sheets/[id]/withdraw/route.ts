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

    // Find the registration
    const { data: registration, error: regError } = await auth.supabase
      .from("registrations")
      .select("id, status")
      .eq("sheet_id", sheetId)
      .eq("player_id", auth.profile.id)
      .in("status", ["confirmed", "waitlist"])
      .single();

    if (regError || !registration) {
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
