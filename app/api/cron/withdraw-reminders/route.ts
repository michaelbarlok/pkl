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

  // Fire reminders at exactly T-60min before the withdraw deadline.
  // Per-minute cron + 2-minute window centered on T-60min so each
  // sheet hits the window at the cron tick nearest its target;
  // withdraw_reminder_sent gates duplicate sends from later ticks.
  const lower = new Date(Date.now() + 59 * 60 * 1000).toISOString();
  const upper = new Date(Date.now() + 61 * 60 * 1000).toISOString();

  const { data: sheets } = await supabase
    .from("signup_sheets")
    .select("*, group:shootout_groups(name)")
    .eq("status", "open")
    .eq("withdraw_reminder_sent", false)
    .not("withdraw_closes_at", "is", null)
    .gte("withdraw_closes_at", lower)
    .lt("withdraw_closes_at", upper)
    // Burst safeguard: cap how many sheets one tick handles so a
    // coincident batch doesn't blow the function timeout.
    // Stragglers get the next tick.
    .limit(50);

  if (!sheets || sheets.length === 0) {
    return NextResponse.json({ reminded: 0 });
  }

  // Process sheets in parallel — independent recipients, independent
  // mark-as-sent. Promise.allSettled so one bad sheet doesn't kill
  // the others.
  const perSheetResults = await Promise.allSettled(
    sheets.map(async (sheet) => {
      // Get all registered (non-withdrawn) players
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

  const totalReminded = perSheetResults.reduce(
    (sum, r) => sum + (r.status === "fulfilled" ? r.value : 0),
    0
  );

  return NextResponse.json({ reminded: totalReminded });
}
