import { requireAuth, isGroupAdmin } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

type Params = { params: Promise<{ id: string }> };

/**
 * Returns the list of recurring schedules (play times) for the group.
 * A group may have zero, one, or many.
 */
export async function GET(_req: NextRequest, { params }: Params) {
  const { id: groupId } = await params;

  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const canManage = await isGroupAdmin(auth.supabase, auth.profile.id, groupId, auth.profile.role);
  if (!canManage) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data, error } = await auth.supabase
    .from("group_recurring_schedules")
    .select("*")
    .eq("group_id", groupId)
    .order("day_of_week", { ascending: true })
    .order("event_time", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ schedules: data ?? [] });
}

/** Create a new play time for the group. */
export async function POST(req: NextRequest, { params }: Params) {
  const { id: groupId } = await params;

  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const canManage = await isGroupAdmin(auth.supabase, auth.profile.id, groupId, auth.profile.role);
  if (!canManage) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { data, error } = await auth.supabase
    .from("group_recurring_schedules")
    .insert({
      group_id: groupId,
      created_by: auth.profile.id,
      label: body.label ?? null,
      day_of_week: body.day_of_week,
      event_time: body.event_time,
      timezone: body.timezone ?? "America/New_York",
      location: body.location,
      player_limit: body.player_limit ?? 16,
      signup_closes_hours_before: body.signup_closes_hours_before ?? 2,
      withdraw_closes_hours_before: body.withdraw_closes_hours_before ?? null,
      allow_member_guests: body.allow_member_guests ?? false,
      notes: body.notes ?? null,
      is_active: body.is_active ?? true,
      post_day_of_week: body.post_day_of_week ?? null,
      post_time: body.post_time ?? null,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ schedule: data }, { status: 201 });
}

/**
 * Update a single play time. Requires ?scheduleId=<uuid> so the caller
 * identifies which row to change.
 */
export async function PUT(req: NextRequest, { params }: Params) {
  const { id: groupId } = await params;
  const scheduleId = new URL(req.url).searchParams.get("scheduleId");
  if (!scheduleId) {
    return NextResponse.json({ error: "scheduleId query param is required" }, { status: 400 });
  }

  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const canManage = await isGroupAdmin(auth.supabase, auth.profile.id, groupId, auth.profile.role);
  if (!canManage) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (body.label !== undefined) updates.label = body.label;
  if (body.day_of_week !== undefined) updates.day_of_week = body.day_of_week;
  if (body.event_time !== undefined) updates.event_time = body.event_time;
  if (body.timezone !== undefined) updates.timezone = body.timezone;
  if (body.location !== undefined) updates.location = body.location;
  if (body.player_limit !== undefined) updates.player_limit = body.player_limit;
  if (body.signup_closes_hours_before !== undefined) updates.signup_closes_hours_before = body.signup_closes_hours_before;
  if (body.withdraw_closes_hours_before !== undefined) updates.withdraw_closes_hours_before = body.withdraw_closes_hours_before;
  if (body.allow_member_guests !== undefined) updates.allow_member_guests = body.allow_member_guests;
  if (body.notes !== undefined) updates.notes = body.notes;
  if (body.is_active !== undefined) updates.is_active = body.is_active;
  // Explicit null resets auto-post for this play time
  if (body.post_day_of_week !== undefined) updates.post_day_of_week = body.post_day_of_week ?? null;
  if (body.post_time !== undefined) updates.post_time = body.post_time ?? null;

  const { data, error } = await auth.supabase
    .from("group_recurring_schedules")
    .update(updates)
    .eq("id", scheduleId)
    .eq("group_id", groupId)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ schedule: data });
}

/** Delete a single play time. Requires ?scheduleId=<uuid>. */
export async function DELETE(req: NextRequest, { params }: Params) {
  const { id: groupId } = await params;
  const scheduleId = new URL(req.url).searchParams.get("scheduleId");
  if (!scheduleId) {
    return NextResponse.json({ error: "scheduleId query param is required" }, { status: 400 });
  }

  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const canManage = await isGroupAdmin(auth.supabase, auth.profile.id, groupId, auth.profile.role);
  if (!canManage) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { error } = await auth.supabase
    .from("group_recurring_schedules")
    .delete()
    .eq("id", scheduleId)
    .eq("group_id", groupId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
