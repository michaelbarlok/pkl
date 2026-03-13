import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: registrationId } = await params;
  const supabase = await createClient();

  // Verify admin auth
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("user_id", user.id)
    .single();

  if (!profile || profile.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Fetch the registration
  const { data: registration, error: regErr } = await supabase
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
  const { error: updateErr } = await supabase
    .from("registrations")
    .update({ status: "withdrawn" })
    .eq("id", registrationId);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  // If confirmed player removed, promote first waitlisted
  if (wasConfirmed) {
    const { data: nextWaitlist } = await supabase
      .from("registrations")
      .select("id, waitlist_position")
      .eq("sheet_id", sheetId)
      .eq("status", "waitlist")
      .order("waitlist_position", { ascending: true })
      .limit(1)
      .single();

    if (nextWaitlist) {
      await supabase
        .from("registrations")
        .update({ status: "confirmed", waitlist_position: null })
        .eq("id", nextWaitlist.id);

      // Reorder remaining waitlist
      const { data: remaining } = await supabase
        .from("registrations")
        .select("id, waitlist_position")
        .eq("sheet_id", sheetId)
        .eq("status", "waitlist")
        .order("waitlist_position", { ascending: true });

      if (remaining) {
        for (let i = 0; i < remaining.length; i++) {
          await supabase
            .from("registrations")
            .update({ waitlist_position: i + 1 })
            .eq("id", remaining[i].id);
        }
      }
    }
  }

  revalidatePath(`/sheets/${sheetId}`);
  revalidatePath("/sheets");

  return NextResponse.json({ success: true });
}
