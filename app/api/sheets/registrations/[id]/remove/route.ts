import { requireAdmin } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { promoteNextWaitlistPlayer } from "@/lib/waitlist";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: registrationId } = await params;

  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  // Use service client to bypass RLS for updating other users' registrations
  const admin = await createServiceClient();

  // Fetch the registration
  const { data: registration, error: regErr } = await admin
    .from("registrations")
    .select("id, sheet_id, status")
    .eq("id", registrationId)
    .in("status", ["confirmed", "waitlist"])
    .single();

  if (regErr || !registration) {
    return NextResponse.json(
      { error: "Registration not found" },
      { status: 404 }
    );
  }

  const wasConfirmed = registration.status === "confirmed";
  const sheetId = registration.sheet_id;

  // Mark as withdrawn
  const { error: updateErr } = await admin
    .from("registrations")
    .update({ status: "withdrawn" })
    .eq("id", registrationId);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  // If confirmed player removed, promote highest-priority waitlisted player
  if (wasConfirmed) {
    await promoteNextWaitlistPlayer(sheetId);
  }

  revalidatePath(`/sheets/${sheetId}`);
  revalidatePath("/sheets");

  return NextResponse.json({ success: true });
}
