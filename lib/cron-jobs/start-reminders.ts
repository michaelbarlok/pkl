import { createServiceClient } from "@/lib/supabase/server";
import { notifyMany } from "@/lib/notify";
import { formatDateInZone, formatTimeInZone } from "@/lib/utils";
import { reminderWhenWord } from "@/lib/reminder-when";

/**
 * Fire "session is in ~24 hours" reminders.
 *
 * Window: T-24h ± 3min, matching the consolidated cron's 5-minute
 * cadence. The `start_reminder_sent` flag dedupes any sheet that
 * lands in two adjacent ticks' overlap.
 */
export async function runStartReminders(): Promise<{ reminded: number }> {
  const supabase = await createServiceClient();

  const lower = new Date(Date.now() + (24 * 60 - 3) * 60 * 1000).toISOString();
  const upper = new Date(Date.now() + (24 * 60 + 3) * 60 * 1000).toISOString();

  const { data: sheets } = await supabase
    .from("signup_sheets")
    .select("id, event_date, event_time, timezone, group_id, group:shootout_groups(name)")
    .neq("status", "cancelled")
    .eq("start_reminder_sent", false)
    .gte("event_time", lower)
    .lt("event_time", upper)
    .limit(50);

  if (!sheets || sheets.length === 0) return { reminded: 0 };

  const perSheetResults = await Promise.allSettled(
    sheets.map(async (sheet) => {
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
        const whenWord = eventTimeStr ? reminderWhenWord(eventTimeStr, tz) : "tomorrow";

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

      await supabase
        .from("signup_sheets")
        .update({ start_reminder_sent: true })
        .eq("id", sheet.id);

      return reminded;
    })
  );

  return {
    reminded: perSheetResults.reduce(
      (sum, r) => sum + (r.status === "fulfilled" ? r.value : 0),
      0
    ),
  };
}
