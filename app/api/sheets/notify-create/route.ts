import { requireAuth, isGroupAdmin } from "@/lib/auth";
import { notifyMany } from "@/lib/notify";
import { NextRequest, NextResponse } from "next/server";
import { formatDateInZone, formatTimeInZone } from "@/lib/utils";

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const { sheetId } = (await request.json()) as { sheetId?: string };
  if (!sheetId) {
    return NextResponse.json({ error: "sheetId is required" }, { status: 400 });
  }

  // Fetch sheet + group
  const { data: sheet } = await auth.supabase
    .from("signup_sheets")
    .select("*, group:shootout_groups(id, name)")
    .eq("id", sheetId)
    .single();

  if (!sheet) {
    return NextResponse.json({ error: "Sheet not found" }, { status: 404 });
  }

  // Allow global admins OR group admins of this sheet's group
  const canManage = await isGroupAdmin(auth.supabase, auth.profile.id, sheet.group_id, auth.profile.role);
  if (!canManage) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Get all group members to notify
  const { data: members } = await auth.supabase
    .from("group_memberships")
    .select("player_id")
    .eq("group_id", sheet.group_id);

  const playerIds = (members ?? []).map(
    (m: { player_id: string }) => m.player_id
  );

  if (playerIds.length > 0) {
    const groupName = sheet.group?.name ?? "Event";
    const tz = (sheet.timezone as string | undefined) ?? "America/New_York";
    const eventDate = sheet.event_time ? formatDateInZone(sheet.event_time, tz) : "";
    const eventTime = sheet.event_time ? formatTimeInZone(sheet.event_time, tz) : null;

    await notifyMany(playerIds, {
      type: "new_sheet",
      title: `New ${groupName} Event`,
      body: `A new event has been posted for ${eventDate}${eventTime ? ` at ${eventTime}` : ""} at ${sheet.location}.`,
      link: `/sheets/${sheetId}`,
      groupId: sheet.group_id,
      emailTemplate: "NewSheet",
      emailData: {
        groupName,
        eventDate: sheet.event_time,
        eventTime: sheet.event_time,
        timezone: tz,
        location: sheet.location,
        sheetId,
      },
    });
  }

  return NextResponse.json({ success: true });
}
