export const dynamic = "force-dynamic";

import { createServiceClient } from "@/lib/supabase/server";
import { verifyCronSecret } from "@/lib/cron-auth";
import { notifyMany } from "@/lib/notify";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/cron/create-scheduled-sheets
 *
 * Runs daily. For each active group_recurring_schedule, checks whether today
 * is exactly `signup_opens_days_before` days before an upcoming matching
 * day_of_week event. If so, creates the signup_sheet (if one doesn't already
 * exist for that group + event_date) and notifies group members.
 */
export async function GET(request: NextRequest) {
  const authError = verifyCronSecret(request);
  if (authError) return authError;

  const supabase = await createServiceClient();

  const { data: schedules, error: schedErr } = await supabase
    .from("group_recurring_schedules")
    .select("*, group:shootout_groups(id, name)")
    .eq("is_active", true);

  if (schedErr) {
    return NextResponse.json({ error: schedErr.message }, { status: 500 });
  }
  if (!schedules || schedules.length === 0) {
    return NextResponse.json({ created: 0 });
  }

  // Today's date in local server time (UTC)
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  let created = 0;

  for (const sched of schedules) {
    const daysAhead = sched.signup_opens_days_before as number;

    // The event date that opens today = today + daysAhead days
    const eventDate = new Date(today);
    eventDate.setUTCDate(eventDate.getUTCDate() + daysAhead);

    // Check the day_of_week matches (0=Sun, 6=Sat)
    if (eventDate.getUTCDay() !== sched.day_of_week) {
      continue;
    }

    const eventDateStr = eventDate.toISOString().split("T")[0]; // YYYY-MM-DD
    const groupId = sched.group_id as string;

    // Check if a sheet already exists for this group + event date
    const { data: existing } = await supabase
      .from("signup_sheets")
      .select("id")
      .eq("group_id", groupId)
      .eq("event_date", eventDateStr)
      .maybeSingle();

    if (existing) continue;

    // Compute signup_closes_at: event_time minus signup_closes_hours_before
    const eventTimeStr = sched.event_time as string; // "HH:MM:SS" or "HH:MM"
    const [hh, mm] = eventTimeStr.split(":").map(Number);
    const closeHours = sched.signup_closes_hours_before as number;

    const signupCloseDt = new Date(eventDate);
    signupCloseDt.setUTCHours(hh, mm, 0, 0);
    signupCloseDt.setUTCHours(signupCloseDt.getUTCHours() - closeHours);
    const signupClosesAt = signupCloseDt.toISOString();

    // Compute withdraw_closes_at (optional)
    let withdrawClosesAt: string | null = null;
    if (sched.withdraw_closes_hours_before != null) {
      const withdrawCloseDt = new Date(eventDate);
      withdrawCloseDt.setUTCHours(hh, mm, 0, 0);
      withdrawCloseDt.setUTCHours(withdrawCloseDt.getUTCHours() - sched.withdraw_closes_hours_before);
      withdrawClosesAt = withdrawCloseDt.toISOString();
    }

    const { data: sheet, error: insertErr } = await supabase
      .from("signup_sheets")
      .insert({
        group_id: groupId,
        event_date: eventDateStr,
        event_time: `${eventDateStr}T${eventTimeStr.slice(0, 5)}:00`,
        location: sched.location,
        player_limit: sched.player_limit,
        signup_closes_at: signupClosesAt,
        withdraw_closes_at: withdrawClosesAt,
        allow_member_guests: sched.allow_member_guests,
        notify_on_create: true,
        notes: sched.notes ?? null,
        status: "open",
        created_by: sched.created_by ?? null,
      })
      .select("id")
      .single();

    if (insertErr || !sheet) continue;

    created++;

    // Notify all group members
    const { data: members } = await supabase
      .from("group_memberships")
      .select("player_id")
      .eq("group_id", groupId);

    const memberIds = (members ?? []).map((m) => m.player_id as string);
    if (memberIds.length > 0) {
      const groupName = (sched.group as any)?.name ?? "your group";
      await notifyMany(memberIds, {
        type: "new_sheet",
        title: "Sign-up sheet posted!",
        body: `A new sign-up sheet for ${groupName} is open for ${eventDateStr}.`,
        link: `/sheets/${sheet.id}`,
        groupId,
      });
    }
  }

  return NextResponse.json({ created });
}
