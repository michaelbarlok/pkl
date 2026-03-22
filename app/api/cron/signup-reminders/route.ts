export const dynamic = "force-dynamic";

import { createServiceClient } from "@/lib/supabase/server";
import { notifyMany } from "@/lib/notify";
import { NextResponse } from "next/server";
import { formatDate } from "@/lib/utils";

export async function GET() {
  const supabase = await createServiceClient();

  // Find sheets where signup closes in the next 1 hour and reminder not yet sent
  const oneHourFromNow = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const now = new Date().toISOString();

  const { data: sheets } = await supabase
    .from("signup_sheets")
    .select("*, group:shootout_groups(name)")
    .eq("status", "open")
    .eq("signup_reminder_sent", false)
    .lte("signup_closes_at", oneHourFromNow)
    .gt("signup_closes_at", now);

  if (!sheets || sheets.length === 0) {
    return NextResponse.json({ reminded: 0 });
  }

  let totalReminded = 0;

  // Fetch all active members once (not per-sheet)
  const { data: allMembers } = await supabase
    .from("profiles")
    .select("id")
    .eq("is_active", true);

  const allMemberIds = (allMembers ?? []).map((m) => m.id);

  for (const sheet of sheets) {
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

    if (unregistered.length > 0) {
      await notifyMany(unregistered, {
        type: "signup_reminder",
        title: "Sign-up closing soon!",
        body: `Sign-up for ${sheet.group?.name ?? "the event"} on ${formatDate(sheet.event_date)} closes in less than 1 hour.`,
        link: `/sheets/${sheet.id}`,
        groupId: sheet.group_id,
        emailTemplate: "SignupReminder",
        emailData: {
          sheetId: sheet.id,
          groupName: sheet.group?.name,
          eventDate: sheet.event_date,
          closesAt: sheet.signup_closes_at,
        },
      });
      totalReminded += unregistered.length;
    }

    // Mark reminder as sent
    await supabase
      .from("signup_sheets")
      .update({ signup_reminder_sent: true })
      .eq("id", sheet.id);
  }

  return NextResponse.json({ reminded: totalReminded });
}
