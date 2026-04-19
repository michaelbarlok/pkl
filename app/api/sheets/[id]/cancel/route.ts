import { requireAuth, isGroupAdmin } from "@/lib/auth";
import { notifyMany } from "@/lib/notify";
import { NextResponse } from "next/server";
import { formatDateInZone, formatTimeInZone } from "@/lib/utils";
import type { CancellationReason } from "@/types/database";

const REASON_LABELS: Record<CancellationReason, string> = {
  lack_of_interest: "Lack of Player Interest",
  inclement_weather: "Inclement Weather",
  other: "Other",
};

const VALID_REASONS = new Set<string>(["lack_of_interest", "inclement_weather", "other"]);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  let cancellationReason: CancellationReason | null = null;
  let cancellationMessage: string | null = null;
  try {
    const body = await request.json();
    if (body.reason && VALID_REASONS.has(body.reason)) {
      cancellationReason = body.reason as CancellationReason;
    }
    if (typeof body.message === "string" && body.message.trim()) {
      cancellationMessage = body.message.trim().slice(0, 500);
    }
  } catch {
    // No body — proceed without reason/message
  }

  // Fetch the sheet to verify it exists and get group info
  const { data: sheet, error: sheetErr } = await auth.supabase
    .from("signup_sheets")
    .select("*, group:shootout_groups(name)")
    .eq("id", id)
    .single();

  if (sheetErr || !sheet) {
    return NextResponse.json({ error: "Sheet not found" }, { status: 404 });
  }

  // Allow global admins OR group admins of this sheet's group
  const canManage = await isGroupAdmin(auth.supabase, auth.profile.id, sheet.group_id, auth.profile.role);
  if (!canManage) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (sheet.status === "cancelled") {
    return NextResponse.json({ error: "Sheet is already cancelled" }, { status: 400 });
  }

  // Update sheet status with reason and message
  const { error: updateErr } = await auth.supabase
    .from("signup_sheets")
    .update({
      status: "cancelled",
      cancellation_reason: cancellationReason,
      cancellation_message: cancellationMessage,
    })
    .eq("id", id);

  if (updateErr) {
    return NextResponse.json({ error: "Failed to cancel sheet" }, { status: 500 });
  }

  // Fetch all registrants + waitlisted to notify
  const { data: registrations } = await auth.supabase
    .from("registrations")
    .select("player_id")
    .eq("sheet_id", id)
    .in("status", ["confirmed", "waitlist"]);

  const playerIds = (registrations ?? []).map((r: { player_id: string }) => r.player_id);

  if (playerIds.length > 0) {
    const groupName = sheet.group?.name ?? "Event";
    const tz = (sheet.timezone as string | undefined) ?? "America/New_York";
    const eventDateDisplay = sheet.event_time ? formatDateInZone(sheet.event_time, tz) : "";
    const eventTimeDisplay = sheet.event_time ? formatTimeInZone(sheet.event_time, tz) : null;

    const reasonLabel = cancellationReason ? REASON_LABELS[cancellationReason] : null;
    const bodyParts = [
      `The ${groupName} event on ${eventDateDisplay}${eventTimeDisplay ? ` at ${eventTimeDisplay}` : ""} has been cancelled.`,
      reasonLabel ? `Reason: ${reasonLabel}` : null,
      cancellationMessage ? `"${cancellationMessage}"` : null,
    ].filter(Boolean);

    await notifyMany(playerIds, {
      type: "sheet_cancelled",
      title: `${groupName} Cancelled`,
      body: bodyParts.join(" "),
      link: `/sheets/${id}`,
      groupId: sheet.group_id,
      emailTemplate: "SheetCancelled",
      emailData: {
        groupName,
        eventDate: sheet.event_time,
        eventTime: sheet.event_time,
        timezone: tz,
        sheetId: id,
        cancellationReason,
        cancellationMessage,
      },
    });
  }

  return NextResponse.json({ success: true });
}
