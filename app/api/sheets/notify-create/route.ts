import { createClient } from "@/lib/supabase/server";
import { notifyMany } from "@/lib/notify";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
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

  const { sheetId } = (await request.json()) as { sheetId?: string };
  if (!sheetId) {
    return NextResponse.json({ error: "sheetId is required" }, { status: 400 });
  }

  // Fetch sheet + group
  const { data: sheet } = await supabase
    .from("signup_sheets")
    .select("*, group:shootout_groups(id, name)")
    .eq("id", sheetId)
    .single();

  if (!sheet) {
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

  // Get all group members to notify
  const { data: members } = await supabase
    .from("group_memberships")
    .select("player_id")
    .eq("group_id", sheet.group_id);

  const playerIds = (members ?? []).map(
    (m: { player_id: string }) => m.player_id
  );

  if (playerIds.length > 0) {
    const groupName = sheet.group?.name ?? "Event";
    const eventDate = new Date(sheet.event_date).toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
    const eventTime = sheet.event_time
      ? new Date(sheet.event_time).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
      : null;

    await notifyMany(playerIds, {
      type: "new_sheet",
      title: `New ${groupName} Event`,
      body: `A new event has been posted for ${eventDate}${eventTime ? ` at ${eventTime}` : ""} at ${sheet.location}.`,
      link: `/sheets/${sheetId}`,
      groupId: sheet.group_id,
      emailTemplate: "NewSheet",
      emailData: {
        groupName,
        eventDate: sheet.event_date,
        eventTime: sheet.event_time,
        location: sheet.location,
        sheetId,
      },
    });
  }

  return NextResponse.json({ success: true });
}
