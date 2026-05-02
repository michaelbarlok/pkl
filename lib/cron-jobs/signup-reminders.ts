import { createServiceClient } from "@/lib/supabase/server";
import { notifyMany } from "@/lib/notify";
import { formatDateInZone } from "@/lib/utils";

/**
 * Fire "signup closes in ~1 hour" reminders.
 *
 * Window: T-60min ± 3min, matching the consolidated cron's 5-minute
 * cadence (was ±1min when the cron ran every minute). The
 * `signup_reminder_sent` flag dedupes any sheet that lands in two
 * adjacent ticks' overlap.
 */
export async function runSignupReminders(): Promise<{ reminded: number }> {
  const supabase = await createServiceClient();

  const lower = new Date(Date.now() + (60 - 3) * 60 * 1000).toISOString();
  const upper = new Date(Date.now() + (60 + 3) * 60 * 1000).toISOString();

  const { data: sheets } = await supabase
    .from("signup_sheets")
    .select("*, group:shootout_groups(name)")
    .eq("status", "open")
    .eq("signup_reminder_sent", false)
    .gte("signup_closes_at", lower)
    .lt("signup_closes_at", upper)
    // Burst safeguard: cap how many sheets one tick handles so a
    // coincident batch doesn't blow the function timeout.
    .limit(50);

  if (!sheets || sheets.length === 0) return { reminded: 0 };

  const { data: allMembers } = await supabase
    .from("profiles")
    .select("id")
    .eq("is_active", true);
  const allMemberIds = (allMembers ?? []).map((m) => m.id);

  const perSheetResults = await Promise.allSettled(
    sheets.map(async (sheet) => {
      const { data: registered } = await supabase
        .from("registrations")
        .select("player_id")
        .eq("sheet_id", sheet.id)
        .neq("status", "withdrawn");
      const registeredIds = new Set((registered ?? []).map((r) => r.player_id));
      const unregistered = allMemberIds.filter((id) => !registeredIds.has(id));

      let reminded = 0;
      if (unregistered.length > 0) {
        await notifyMany(unregistered, {
          type: "signup_reminder",
          title: "Sign-up closing soon!",
          body: `Sign-up for ${sheet.group?.name ?? "the event"} on ${formatDateInZone(sheet.event_time, sheet.timezone)} closes in less than 1 hour.`,
          link: `/sheets/${sheet.id}`,
          groupId: sheet.group_id,
          emailTemplate: "SignupReminder",
          emailData: {
            sheetId: sheet.id,
            groupName: sheet.group?.name,
            eventDate: sheet.event_time,
            closesAt: sheet.signup_closes_at,
            timezone: sheet.timezone,
          },
        });
        reminded = unregistered.length;
      }

      await supabase
        .from("signup_sheets")
        .update({ signup_reminder_sent: true })
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
