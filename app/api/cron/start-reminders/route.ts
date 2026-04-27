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

  // Fire reminders at exactly T-24h before event_time. Per-minute
  // cron + 2-minute window centered on T-24h so each sheet hits
  // the window at the cron tick nearest its target;
  // start_reminder_sent gates duplicates from later ticks.
  const lower = new Date(Date.now() + (24 * 60 - 1) * 60 * 1000).toISOString();
  const upper = new Date(Date.now() + (24 * 60 + 1) * 60 * 1000).toISOString();

  const { data: sheets } = await supabase
    .from("signup_sheets")
    .select("id, event_date, event_time, timezone, group_id, group:shootout_groups(name)")
    .neq("status", "cancelled")
    .eq("start_reminder_sent", false)
    .gte("event_time", lower)
    .lt("event_time", upper)
    // Burst safeguard: cap how many sheets one tick handles so a
    // coincident batch doesn't blow the function timeout.
    // Stragglers get the next tick.
    .limit(50);

  if (!sheets || sheets.length === 0) {
    return NextResponse.json({ reminded: 0 });
  }

  // Process sheets in parallel — each sheet's recipients and
  // mark-as-sent write are independent. Promise.allSettled so one
  // bad sheet doesn't kill the others.
  const perSheetResults = await Promise.allSettled(
    sheets.map(async (sheet) => {
      // Only notify confirmed players — waitlisted players aren't holding a spot
      const { data: registrants } = await supabase
        .from("registrations")
        .select("player_id")
        .eq("sheet_id", sheet.id)
        .eq("status", "confirmed");

      const playerIds = (registrants ?? []).map((r) => r.player_id);

      let reminded = 0;
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
        reminded = playerIds.length;
      }

      // Mark reminder sent regardless of player count to avoid repeated DB hits
      await supabase
        .from("signup_sheets")
        .update({ start_reminder_sent: true })
        .eq("id", sheet.id);

      return reminded;
    })
  );

  const totalReminded = perSheetResults.reduce(
    (sum, r) => sum + (r.status === "fulfilled" ? r.value : 0),
    0
  );

  return NextResponse.json({ reminded: totalReminded });
}
