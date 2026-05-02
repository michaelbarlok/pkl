import { createServiceClient } from "@/lib/supabase/server";
import { notifyMany } from "@/lib/notify";
import { formatDateInZone } from "@/lib/utils";

/**
 * Fire "withdraw closes in ~1 hour" reminders.
 *
 * Window: T-60min ± 3min, matching the consolidated cron's 5-minute
 * cadence. The `withdraw_reminder_sent` flag dedupes any sheet that
 * lands in two adjacent ticks' overlap.
 */
export async function runWithdrawReminders(): Promise<{ reminded: number }> {
  const supabase = await createServiceClient();

  const lower = new Date(Date.now() + (60 - 3) * 60 * 1000).toISOString();
  const upper = new Date(Date.now() + (60 + 3) * 60 * 1000).toISOString();

  const { data: sheets } = await supabase
    .from("signup_sheets")
    .select("*, group:shootout_groups(name)")
    .eq("status", "open")
    .eq("withdraw_reminder_sent", false)
    .not("withdraw_closes_at", "is", null)
    .gte("withdraw_closes_at", lower)
    .lt("withdraw_closes_at", upper)
    .limit(50);

  if (!sheets || sheets.length === 0) return { reminded: 0 };

  const perSheetResults = await Promise.allSettled(
    sheets.map(async (sheet) => {
      const { data: registrants } = await supabase
        .from("registrations")
        .select("player_id")
        .eq("sheet_id", sheet.id)
        .neq("status", "withdrawn");

      const playerIds = (registrants ?? []).map((r) => r.player_id);

      let reminded = 0;
      if (playerIds.length > 0) {
        await notifyMany(playerIds, {
          type: "withdraw_closing",
          title: "Withdrawal window closing",
          body: `The withdrawal window for ${sheet.group?.name ?? "the event"} on ${formatDateInZone(sheet.event_time, sheet.timezone)} closes in less than 1 hour.`,
          link: `/sheets/${sheet.id}`,
          groupId: sheet.group_id,
          emailTemplate: "WithdrawReminder",
          emailData: {
            sheetId: sheet.id,
            groupName: sheet.group?.name,
            eventDate: sheet.event_time,
            closesAt: sheet.withdraw_closes_at,
            timezone: sheet.timezone,
          },
        });
        reminded = playerIds.length;
      }

      await supabase
        .from("signup_sheets")
        .update({ withdraw_reminder_sent: true })
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
