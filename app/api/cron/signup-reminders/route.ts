export const dynamic = "force-dynamic";

import { createServiceClient } from "@/lib/supabase/server";
import { notifyMany } from "@/lib/notify";
import { verifyCronSecret } from "@/lib/cron-auth";
import { NextRequest, NextResponse } from "next/server";
import { formatDateInZone } from "@/lib/utils";

export async function GET(request: NextRequest) {
  const authError = verifyCronSecret(request);
  if (authError) return authError;
  const supabase = await createServiceClient();

  // Fire reminders at exactly T-60min before signup closes. The
  // cron runs every minute (`* * * * *`); we look for sheets whose
  // close time falls inside a tight 2-minute window centered on
  // T-60min so each sheet is caught in the cron tick nearest its
  // T-60min mark, then the signup_reminder_sent flag suppresses
  // any subsequent ticks. Window width matches cron cadence so
  // every sheet hits the window at least once.
  const lower = new Date(Date.now() + 59 * 60 * 1000).toISOString();
  const upper = new Date(Date.now() + 61 * 60 * 1000).toISOString();

  const { data: sheets } = await supabase
    .from("signup_sheets")
    .select("*, group:shootout_groups(name)")
    .eq("status", "open")
    .eq("signup_reminder_sent", false)
    .gte("signup_closes_at", lower)
    .lt("signup_closes_at", upper)
    // Burst safeguard: cap how many sheets one cron run handles
    // so a coincident batch (e.g. 30 groups all created sheets
    // closing at the same minute) doesn't blow the function
    // timeout. Stragglers get picked up on the next per-minute
    // tick — they're still in the 2-minute window then.
    .limit(50);

  if (!sheets || sheets.length === 0) {
    return NextResponse.json({ reminded: 0 });
  }

  // Fetch all active members once (not per-sheet)
  const { data: allMembers } = await supabase
    .from("profiles")
    .select("id")
    .eq("is_active", true);

  const allMemberIds = (allMembers ?? []).map((m) => m.id);

  // Process sheets in parallel — each sheet's work is independent
  // (different recipients, different mark-as-sent write). Promise
  // .allSettled so one bad sheet doesn't kill the others.
  const perSheetResults = await Promise.allSettled(
    sheets.map(async (sheet) => {
      // Get already-registered player IDs
      const { data: registered } = await supabase
        .from("registrations")
        .select("player_id")
        .eq("sheet_id", sheet.id)
        .neq("status", "withdrawn");

      const registeredIds = new Set(
        (registered ?? []).map((r) => r.player_id)
      );

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

      // Mark reminder as sent
      await supabase
        .from("signup_sheets")
        .update({ signup_reminder_sent: true })
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
