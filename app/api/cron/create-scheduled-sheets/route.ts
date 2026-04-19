export const dynamic = "force-dynamic";

import { createServiceClient } from "@/lib/supabase/server";
import { verifyCronSecret } from "@/lib/cron-auth";
import { notifyMany } from "@/lib/notify";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/cron/create-scheduled-sheets
 *
 * Runs every minute. Processes every schedule whose precomputed
 * `next_post_at` has come due. The DB trigger keeps `next_post_at`
 * in sync with the admin's intent, so this route does no timezone
 * matching of its own — it just drains the queue.
 *
 * Missed fires self-heal: if Vercel's cron misses a minute (deploy,
 * outage, cold start), due rows stay due and are picked up by the
 * next run.
 */
export async function GET(request: NextRequest) {
  const authError = verifyCronSecret(request);
  if (authError) return authError;

  const supabase = await createServiceClient();

  const nowIso = new Date().toISOString();
  const { data: due, error: queryErr } = await supabase
    .from("group_recurring_schedules")
    .select("*, group:shootout_groups(id, name)")
    .eq("is_active", true)
    .not("next_post_at", "is", null)
    .lte("next_post_at", nowIso);

  if (queryErr) {
    return NextResponse.json({ error: queryErr.message }, { status: 500 });
  }
  if (!due || due.length === 0) {
    return NextResponse.json({ created: 0 });
  }

  let created = 0;

  for (const sched of due) {
    const tz = (sched.timezone as string) || "America/New_York";
    const playDow = sched.day_of_week as number;

    // Next occurrence of the play day of week in the schedule's local zone
    const nowLocalDateStr = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
    const localToday = new Date(nowLocalDateStr + "T00:00:00Z");
    const localTodayDow = getDowInZone(new Date(), tz);
    let daysUntilPlay = (playDow - localTodayDow + 7) % 7;
    if (daysUntilPlay === 0) daysUntilPlay = 7;

    const eventDate = new Date(localToday);
    eventDate.setUTCDate(eventDate.getUTCDate() + daysUntilPlay);
    const eventDateStr = eventDate.toISOString().split("T")[0];

    const eventTimeStr = (sched.event_time as string).slice(0, 5); // "HH:MM"
    const [evH, evM] = eventTimeStr.split(":").map(Number);
    const closeHours = sched.signup_closes_hours_before as number;

    // Event instant in UTC (tz-correct)
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

    const groupId = sched.group_id as string;

    const { data: sheet, error: insertErr } = await supabase
      .from("signup_sheets")
      .insert({
        group_id: groupId,
        event_date: eventDateStr,
        event_time: eventTimeIso,
        timezone: tz,
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

    // A duplicate-key error means another run already created this sheet;
    // treat as success and advance the queue so we don't keep retrying.
    const isDuplicate =
      insertErr?.code === "23505" ||
      /duplicate key|signup_sheets_group_event_date_unique/i.test(insertErr?.message ?? "");

    if (insertErr && !isDuplicate) {
      console.error(`[cron] insert failed for schedule ${sched.id}:`, insertErr.message);
      continue;
    }

    // Always advance the queue after a confirmed post (or confirmed duplicate).
    const { error: bumpErr } = await supabase.rpc("bump_schedule_next_post_at", {
      p_schedule_id: sched.id,
    });
    if (bumpErr) {
      console.error(`[cron] bump_schedule_next_post_at failed for ${sched.id}:`, bumpErr.message);
      // Don't continue — still try to notify if we have a sheet id
    }

    if (!sheet) continue;
    created++;

    // Notify all group members about the newly posted sheet
    const { data: members } = await supabase
      .from("group_memberships")
      .select("player_id")
      .eq("group_id", groupId);

    const memberIds = (members ?? []).map((m) => m.player_id as string);
    if (memberIds.length > 0) {
      const groupName = (sched.group as { name?: string } | null)?.name ?? "your group";
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

  return NextResponse.json({ created, candidates: due.length });
}

/**
 * Day-of-week (0=Sun..6=Sat) of `d` in the given IANA timezone.
 */
function getDowInZone(d: Date, tz: string): number {
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(d);
  const SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return SHORT.findIndex((x) => weekday.startsWith(x));
}

/**
 * Convert a local datetime string (YYYY-MM-DDTHH:MM:SS) in the given IANA
 * timezone to a UTC Date object.
 */
function localToUtc(localStr: string, tz: string): Date {
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
