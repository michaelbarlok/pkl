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

  if (!profile || profile.role !== "admin") {
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

    await notifyMany(playerIds, {
      type: "new_sheet",
      title: `New ${groupName} Event`,
      body: `A new event has been posted for ${eventDate} at ${sheet.location}.`,
      link: `/sheets/${sheetId}`,
      groupId: sheet.group_id,
      emailTemplate: "NewSheet",
      emailData: {
        groupName,
        eventDate: sheet.event_date,
        location: sheet.location,
        sheetId,
      },
    });
  }

  return NextResponse.json({ success: true });
}
