export const dynamic = "force-dynamic";

import { createServiceClient } from "@/lib/supabase/server";
import { notifyMany } from "@/lib/notify";
import { verifyCronSecret } from "@/lib/cron-auth";
import { NextRequest, NextResponse } from "next/server";
import { formatDateInZone, formatTimeInZone } from "@/lib/utils";
import { reminderWhenWord } from "@/lib/reminder-when";

export async function GET(request: NextRequest) {
  const authError = verifyCronSecret(request);
  if (authError) return authError;

  const supabase = await createServiceClient();

  // Find sheets that start within the next 25 hours and haven't had a reminder sent yet.
  // Using a 25-hour window (not exactly 24) so the hourly cron never misses a sheet.
  // The start_reminder_sent flag ensures each sheet is only reminded once.
  const twentyFiveHoursFromNow = new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString();
  const now = new Date().toISOString();

  const { data: sheets } = await supabase
    .from("signup_sheets")
    .select("id, event_date, event_time, timezone, group_id, group:shootout_groups(name)")
    .neq("status", "cancelled")
    .eq("start_reminder_sent", false)
    .lte("event_time", twentyFiveHoursFromNow)
    .gt("event_time", now);

  if (!sheets || sheets.length === 0) {
    return NextResponse.json({ reminded: 0 });
  }

  let totalReminded = 0;

  for (const sheet of sheets) {
    // Only notify confirmed players — waitlisted players aren't holding a spot
    const { data: registrants } = await supabase
      .from("registrations")
      .select("player_id")
      .eq("sheet_id", sheet.id)
      .eq("status", "confirmed");

    const playerIds = (registrants ?? []).map((r) => r.player_id);

    if (playerIds.length > 0) {
      const gName = (sheet.group as { name?: string } | null)?.name ?? "the event";
      const eventTimeStr = sheet.event_time ?? "";
      const tz = (sheet.timezone as string) ?? "America/New_York";
      const dateDisplay = eventTimeStr ? formatDateInZone(eventTimeStr, tz) : "";
      const timeDisplay = eventTimeStr ? formatTimeInZone(eventTimeStr, tz) : "";
      const whenWord = eventTimeStr
        ? reminderWhenWord(eventTimeStr, tz)
        : "tomorrow";

      await notifyMany(playerIds, {
        type: "session_starting",
        title: `Session ${whenWord}: ${gName}`,
        body: `You're confirmed for ${gName} on ${dateDisplay}${timeDisplay ? ` at ${timeDisplay}` : ""}. Can't make it? Please withdraw so someone on the waitlist can play.`,
        link: `/sheets/${sheet.id}`,
        groupId: sheet.group_id,
        emailTemplate: "SessionStarting",
        emailData: {
          groupName: gName,
          eventDate: eventTimeStr,
          eventTime: eventTimeStr,
          timezone: tz,
          sheetId: sheet.id,
          whenWord,
        },
      });

      totalReminded += playerIds.length;
    }

    // Mark reminder sent regardless of player count to avoid repeated DB hits
    await supabase
      .from("signup_sheets")
      .update({ start_reminder_sent: true })
      .eq("id", sheet.id);
  }

  return NextResponse.json({ reminded: totalReminded });
}
