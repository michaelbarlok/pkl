export const dynamic = "force-dynamic";

import { createServiceClient } from "@/lib/supabase/server";
import { notifyMany } from "@/lib/notify";
import { verifyCronSecret } from "@/lib/cron-auth";
import { NextRequest, NextResponse } from "next/server";
import { formatDate } from "@/lib/utils";

export async function GET(request: NextRequest) {
  const authError = verifyCronSecret(request);
  if (authError) return authError;
  const supabase = await createServiceClient();

  const oneHourFromNow = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const now = new Date().toISOString();

  // Find sheets where withdraw closes in the next 1 hour
  const { data: sheets } = await supabase
    .from("signup_sheets")
    .select("*, group:shootout_groups(name)")
    .eq("status", "open")
    .eq("withdraw_reminder_sent", false)
    .not("withdraw_closes_at", "is", null)
    .lte("withdraw_closes_at", oneHourFromNow)
    .gt("withdraw_closes_at", now);

  if (!sheets || sheets.length === 0) {
    return NextResponse.json({ reminded: 0 });
  }

  let totalReminded = 0;

  for (const sheet of sheets) {
    // Get all registered (non-withdrawn) players
    const { data: registrants } = await supabase
      .from("registrations")
      .select("player_id")
      .eq("sheet_id", sheet.id)
      .neq("status", "withdrawn");

    const playerIds = (registrants ?? []).map((r) => r.player_id);

    if (playerIds.length > 0) {
      await notifyMany(playerIds, {
        type: "withdraw_closing",
        title: "Withdrawal window closing",
        body: `The withdrawal window for ${sheet.group?.name ?? "the event"} on ${formatDate(sheet.event_date)} closes in less than 1 hour.`,
        link: `/sheets/${sheet.id}`,
        groupId: sheet.group_id,
        emailTemplate: "WithdrawReminder",
        emailData: {
          sheetId: sheet.id,
          groupName: sheet.group?.name,
          eventDate: sheet.event_date,
          closesAt: sheet.withdraw_closes_at,
        },
      });
      totalReminded += playerIds.length;
    }

    await supabase
      .from("signup_sheets")
      .update({ withdraw_reminder_sent: true })
      .eq("id", sheet.id);
  }

  return NextResponse.json({ reminded: totalReminded });
}
