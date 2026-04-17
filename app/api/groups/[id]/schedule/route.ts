import { requireAuth, isGroupAdmin } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

type Params = { params: Promise<{ id: string }> };

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
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ schedule: data });
}

export async function POST(req: NextRequest, { params }: Params) {
  const { id: groupId } = await params;

  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const canManage = await isGroupAdmin(auth.supabase, auth.profile.id, groupId, auth.profile.role);
  if (!canManage) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { error } = await auth.supabase.from("group_recurring_schedules").insert({
    group_id: groupId,
    created_by: auth.profile.id,
    day_of_week: body.day_of_week,
    event_time: body.event_time,
    location: body.location,
    player_limit: body.player_limit ?? 16,
    signup_opens_days_before: body.signup_opens_days_before ?? 7,
    signup_closes_hours_before: body.signup_closes_hours_before ?? 2,
    withdraw_closes_hours_before: body.withdraw_closes_hours_before ?? null,
    allow_member_guests: body.allow_member_guests ?? false,
    notes: body.notes ?? null,
    is_active: body.is_active ?? true,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ message: "Schedule created" }, { status: 201 });
}

export async function PUT(req: NextRequest, { params }: Params) {
  const { id: groupId } = await params;

  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const canManage = await isGroupAdmin(auth.supabase, auth.profile.id, groupId, auth.profile.role);
  if (!canManage) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (body.day_of_week !== undefined) updates.day_of_week = body.day_of_week;
  if (body.event_time !== undefined) updates.event_time = body.event_time;
  if (body.location !== undefined) updates.location = body.location;
  if (body.player_limit !== undefined) updates.player_limit = body.player_limit;
  if (body.signup_opens_days_before !== undefined) updates.signup_opens_days_before = body.signup_opens_days_before;
  if (body.signup_closes_hours_before !== undefined) updates.signup_closes_hours_before = body.signup_closes_hours_before;
  if (body.withdraw_closes_hours_before !== undefined) updates.withdraw_closes_hours_before = body.withdraw_closes_hours_before;
  if (body.allow_member_guests !== undefined) updates.allow_member_guests = body.allow_member_guests;
  if (body.notes !== undefined) updates.notes = body.notes;
  if (body.is_active !== undefined) updates.is_active = body.is_active;

  const { error } = await auth.supabase
    .from("group_recurring_schedules")
    .update(updates)
    .eq("group_id", groupId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ message: "Schedule updated" });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id: groupId } = await params;

  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const canManage = await isGroupAdmin(auth.supabase, auth.profile.id, groupId, auth.profile.role);
  if (!canManage) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { error } = await auth.supabase
    .from("group_recurring_schedules")
    .delete()
    .eq("group_id", groupId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ message: "Schedule deleted" });
}
