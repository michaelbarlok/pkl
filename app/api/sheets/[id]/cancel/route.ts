import { createClient } from "@/lib/supabase/server";
import { notifyMany } from "@/lib/notify";
import { NextResponse } from "next/server";
import { formatDate, formatTime } from "@/lib/utils";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
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

  if (!profile) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Fetch the sheet to verify it exists and get group info
  const { data: sheet, error: sheetErr } = await supabase
    .from("signup_sheets")
    .select("*, group:shootout_groups(name)")
    .eq("id", id)
    .single();

  if (sheetErr || !sheet) {
    return NextResponse.json({ error: "Sheet not found" }, { status: 404 });
  }

  // Allow global admins OR group admins of this sheet's group
  if (profile.role !== "admin") {
    const { data: membership } = await supabase
      .from("group_memberships")
      .select("group_role")
      .eq("group_id", sheet.group_id)
      .eq("player_id", profile.id)
      .single();

    if (!membership || membership.group_role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  if (sheet.status === "cancelled") {
    return NextResponse.json(
      { error: "Sheet is already cancelled" },
      { status: 400 }
    );
  }

  // Update sheet status
  const { error: updateErr } = await supabase
    .from("signup_sheets")
    .update({ status: "cancelled" })
    .eq("id", id);

  if (updateErr) {
    return NextResponse.json(
      { error: "Failed to cancel sheet" },
      { status: 500 }
    );
  }

  // Fetch all registrants + waitlisted to notify
  const { data: registrations } = await supabase
    .from("registrations")
    .select("player_id")
    .eq("sheet_id", id)
    .in("status", ["confirmed", "waitlist"]);

  const playerIds = (registrations ?? []).map(
    (r: { player_id: string }) => r.player_id
  );

  if (playerIds.length > 0) {
    const groupName = sheet.group?.name ?? "Event";
    const eventDate = formatDate(sheet.event_date);
    const eventTime = sheet.event_time
      ? formatTime(sheet.event_time)
      : null;

    await notifyMany(playerIds, {
      type: "sheet_cancelled",
      title: `${groupName} Cancelled`,
      body: `The ${groupName} event on ${eventDate}${eventTime ? ` at ${eventTime}` : ""} has been cancelled.`,
      link: `/sheets/${id}`,
      groupId: sheet.group_id,
      emailTemplate: "SheetCancelled",
      emailData: { groupName, eventDate, eventTime: sheet.event_time, sheetId: id },
    });
  }

  return NextResponse.json({ success: true });
}
