export const dynamic = "force-dynamic";

import { createServiceClient } from "@/lib/supabase/server";
import { verifyCronSecret } from "@/lib/cron-auth";
import { notifyMany } from "@/lib/notify";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/cron/create-scheduled-sheets
 *
 * Runs every hour. For each active group_recurring_schedule that has
 * post_day_of_week + post_time set, converts the current UTC time into the
 * schedule's timezone and checks whether the hour/day matches the post
 * schedule. When it does — and no sheet already exists for the upcoming play
 * day — it creates the sheet and notifies all group members.
 */
export async function GET(request: NextRequest) {
  const authError = verifyCronSecret(request);
  if (authError) return authError;

  const supabase = await createServiceClient();

  const { data: schedules, error: schedErr } = await supabase
    .from("group_recurring_schedules")
    .select("*, group:shootout_groups(id, name)")
    .eq("is_active", true)
    .not("post_day_of_week", "is", null)
    .not("post_time", "is", null);

  if (schedErr) return NextResponse.json({ error: schedErr.message }, { status: 500 });
  if (!schedules || schedules.length === 0) return NextResponse.json({ created: 0 });

  const now = new Date();
  let created = 0;

  for (const sched of schedules) {
    const tz = (sched.timezone as string) || "America/New_York";

    // Convert current UTC time to the schedule's local timezone
    const localParts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "numeric",
      minute: "numeric",
      weekday: "short",
      hour12: false,
    }).formatToParts(now);

    // Normalize hour: some Intl implementations return 24 for midnight instead of 0
    const rawHour = parseInt(localParts.find((p) => p.type === "hour")?.value ?? "0", 10);
    const localHour = rawHour === 24 ? 0 : rawHour;
    const localMinute = parseInt(localParts.find((p) => p.type === "minute")?.value ?? "0", 10);
    const localWeekdayShort = localParts.find((p) => p.type === "weekday")?.value ?? "";

    const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const localDayOfWeek = WEEKDAY_SHORT.findIndex((d) => localWeekdayShort.startsWith(d));

    // Parse the configured post time (stored as "HH:MM:SS")
    const [postH, postM] = ((sched.post_time as string) ?? "08:00:00").split(":").map(Number);

    // Round localMinute down to the nearest 15-min mark so cron jitter (1-2 min late)
    // doesn't cause us to miss the window entirely. Post times are restricted to :00/:15/:30/:45.
    const roundedMinute = Math.floor(localMinute / 15) * 15;

    const hourMatches = localHour === postH;
    const minuteMatches = roundedMinute === postM;
    const dayMatches = localDayOfWeek === (sched.post_day_of_week as number);

    console.log(`[cron] schedule ${sched.id}: local=${WEEKDAY_SHORT[localDayOfWeek]} ${localHour}:${String(localMinute).padStart(2,"0")} (rounded min=${roundedMinute}), target=${WEEKDAY_SHORT[sched.post_day_of_week as number]} ${postH}:${String(postM).padStart(2,"0")}, match=${dayMatches && hourMatches && minuteMatches}`);

    if (!dayMatches || !hourMatches || !minuteMatches) continue;

    // Find the next occurrence of the play day_of_week in the local timezone
    const playDow = sched.day_of_week as number;
    const localDateStr = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(now); // YYYY-MM-DD
    const localDate = new Date(localDateStr + "T00:00:00Z"); // midnight UTC = local date

    let daysUntilPlay = (playDow - localDayOfWeek + 7) % 7;
    if (daysUntilPlay === 0) daysUntilPlay = 7; // always schedule the next upcoming day, not today if posting today

    const eventDate = new Date(localDate);
    eventDate.setUTCDate(eventDate.getUTCDate() + daysUntilPlay);
    const eventDateStr = eventDate.toISOString().split("T")[0];

    const groupId = sched.group_id as string;

    // Skip if sheet already exists for this group + event date
    const { data: existing } = await supabase
      .from("signup_sheets")
      .select("id")
      .eq("group_id", groupId)
      .eq("event_date", eventDateStr)
      .maybeSingle();

    if (existing) continue;

    // Compute signup_closes_at in UTC
    const eventTimeStr = (sched.event_time as string).slice(0, 5); // "HH:MM"
    const [evH, evM] = eventTimeStr.split(":").map(Number);
    const closeHours = sched.signup_closes_hours_before as number;

    // Build the event datetime in local time, then convert to UTC via Intl trick.
    // event_time is a timestamptz column — writing a naive local string would be
    // interpreted as UTC by Postgres and display at the wrong hour on clients.
    const localEventStr = `${eventDateStr}T${eventTimeStr.padStart(5, "0")}:00`;
    const eventTimeUtc = localToUtc(localEventStr, tz);
    const eventTimeIso = eventTimeUtc.toISOString();

    const signupCloseDt = new Date(eventTimeUtc.getTime());
    signupCloseDt.setUTCHours(signupCloseDt.getUTCHours() - closeHours);
    const signupClosesAt = signupCloseDt.toISOString();

    let withdrawClosesAt: string | null = null;
    if (sched.withdraw_closes_hours_before != null) {
      const withdrawDt = new Date(eventTimeUtc.getTime());
      withdrawDt.setUTCHours(withdrawDt.getUTCHours() - sched.withdraw_closes_hours_before);
      withdrawClosesAt = withdrawDt.toISOString();
    }

    const { data: sheet, error: insertErr } = await supabase
      .from("signup_sheets")
      .insert({
        group_id: groupId,
        event_date: eventDateStr,
        event_time: eventTimeIso,
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
      // Format local event time for notification copy
      const h = evH === 0 ? 12 : evH > 12 ? evH - 12 : evH;
      const ampm = evH >= 12 ? "pm" : "am";
      const displayTime = `${h}:${String(evM).padStart(2, "0")} ${ampm}`;

      await notifyMany(memberIds, {
        type: "new_sheet",
        title: `Sign-up open — ${groupName}`,
        body: `A new sign-up sheet is open for ${groupName} on ${eventDateStr} at ${displayTime}.`,
        link: `/sheets/${sheet.id}`,
        groupId,
        emailTemplate: "NewSheet",
        emailData: {
          groupName,
          eventDate: eventDateStr,
          eventTime: eventTimeIso,
          location: sched.location,
          sheetId: sheet.id,
        },
      });
    }
  }

  return NextResponse.json({ created });
}

/**
 * Convert a local datetime string (YYYY-MM-DDTHH:MM:SS) in the given IANA
 * timezone to a UTC Date object.
 */
function localToUtc(localStr: string, tz: string): Date {
  // Format: find the UTC offset at that moment using Intl
  // We iterate by adjusting until the local representation matches.
  const candidate = new Date(localStr + "Z"); // initial guess treating as UTC
  const offsetMs = getUtcOffsetMs(candidate, tz);
  return new Date(candidate.getTime() - offsetMs);
}

function getUtcOffsetMs(utcDate: Date, tz: string): number {
  const utcParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  }).formatToParts(utcDate);

  const localParts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  }).formatToParts(utcDate);

  const toMs = (parts: Intl.DateTimeFormatPart[]) => {
    const get = (t: string) => parseInt(parts.find((p) => p.type === t)?.value ?? "0", 10);
    return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  };

  return toMs(localParts) - toMs(utcParts);
}
