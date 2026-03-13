import { createClient, createServiceClient } from "@/lib/supabase/server";
import { notify } from "@/lib/notify";
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
    let { data: waitlisted } = await admin
      .from("registrations")
      .select("id, player_id, waitlist_position, priority")
      .eq("sheet_id", sheetId)
      .eq("status", "waitlist")
      .order("waitlist_position", { ascending: true });

    // Fallback if priority column doesn't exist yet
    if (!waitlisted) {
      const fallback = await admin
        .from("registrations")
        .select("id, player_id, waitlist_position")
        .eq("sheet_id", sheetId)
        .eq("status", "waitlist")
        .order("waitlist_position", { ascending: true });
      waitlisted = fallback.data;
    }

    const priorityOrder: Record<string, number> = { high: 0, normal: 1, low: 2 };
    const sorted = (waitlisted ?? []).sort((a: any, b: any) => {
      const aPri = priorityOrder[a.priority ?? "normal"] ?? 1;
      const bPri = priorityOrder[b.priority ?? "normal"] ?? 1;
      if (aPri !== bPri) return aPri - bPri;
      return (a.waitlist_position ?? 999) - (b.waitlist_position ?? 999);
    });
    const nextWaitlist = sorted[0] ?? null;

    if (nextWaitlist) {
      await admin
        .from("registrations")
        .update({ status: "confirmed", waitlist_position: null })
        .eq("id", nextWaitlist.id);

      // Reorder remaining waitlist
      const { data: remaining } = await admin
        .from("registrations")
        .select("id, waitlist_position")
        .eq("sheet_id", sheetId)
        .eq("status", "waitlist")
        .order("waitlist_position", { ascending: true });

      if (remaining) {
        for (let i = 0; i < remaining.length; i++) {
          await admin
            .from("registrations")
            .update({ waitlist_position: i + 1 })
            .eq("id", remaining[i].id);
        }
      }

      // Notify the promoted player
      const { data: sheet } = await admin
        .from("signup_sheets")
        .select("event_date, group:shootout_groups(name)")
        .eq("id", sheetId)
        .single();

      const groupName = (sheet as any)?.group?.name ?? "the event";
      const eventDate = sheet?.event_date ?? "";

      notify({
        userId: nextWaitlist.player_id,
        type: "waitlist_promoted",
        title: "You're in!",
        body: `A spot opened up for ${groupName} on ${eventDate ? new Date(eventDate).toLocaleDateString() : "the upcoming date"}. You've been moved from the waitlist to the confirmed list.`,
        link: `/sheets/${sheetId}`,
        emailTemplate: "WaitlistPromoted",
        emailData: { groupName, eventDate, sheetId },
      }).catch((err) => console.error("Waitlist promotion notify failed:", err));
    }
  }

  revalidatePath(`/sheets/${sheetId}`);
  revalidatePath("/sheets");

  return NextResponse.json({ success: true });
}
