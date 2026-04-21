/**
 * POST /api/sessions/[id]/start
 *
 * Transitions a session into round_active and fans out a
 * "your court is ready" push to every checked-in player, with their
 * own court number in the body. Click-through lands on the Play tab
 * for that session (/sessions/[id]).
 *
 * Why an API (vs a client-side supabase.update): the notification
 * fan-out has to run under the service client so RLS-scoped
 * notification rows land for every player, and so one admin's tap
 * doesn't need to be a group admin for every recipient. Keeping the
 * status update in the same handler also means either both happen
 * or neither does — no half-started session without notifications.
 */
import { requireAuth, isGroupAdmin } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { notify } from "@/lib/notify";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const { id: sessionId } = await params;

  const { data: session, error: sessionErr } = await auth.supabase
    .from("shootout_sessions")
    .select("id, status, group_id, group:shootout_groups(name)")
    .eq("id", sessionId)
    .single();

  if (sessionErr || !session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const admin = await isGroupAdmin(
    auth.supabase,
    auth.profile.id,
    session.group_id,
    auth.profile.role
  );
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Advance status — the status check guards against a double-start
  // (e.g. two admins tapping at once) silently re-broadcasting.
  if (session.status !== "round_active") {
    const { error: updateErr } = await auth.supabase
      .from("shootout_sessions")
      .update({ status: "round_active" })
      .eq("id", sessionId);
    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }
  } else {
    // Already round_active — don't re-notify. Return ok so the
    // advance-status UI still considers it successful.
    return NextResponse.json({ ok: true, notified: 0, alreadyActive: true });
  }

  // Fan out the per-player notifications via the service client so we
  // can write notification rows regardless of the caller's RLS.
  const serviceClient = await createServiceClient();
  const { data: participants } = await serviceClient
    .from("session_participants")
    .select("player_id, court_number")
    .eq("session_id", sessionId)
    .eq("checked_in", true);

  const groupName =
    (session.group as { name?: string } | null)?.name ?? "your session";
  const link = `/sessions/${sessionId}`;

  // Parallelize the notify() calls — notify() internally writes an
  // in-app row + optionally sends push/email. Concurrency keeps the
  // request fast even for a 30-person session.
  const results = await Promise.allSettled(
    (participants ?? []).map((p) => {
      const body =
        p.court_number != null
          ? `Head to Court ${p.court_number}!`
          : "Session started — check the app for your court.";
      return notify({
        profileId: p.player_id,
        type: "pool_assigned",
        title: `Session started: ${groupName}`,
        body,
        link,
        groupId: session.group_id,
      });
    })
  );

  const failed = results.filter((r) => r.status === "rejected").length;
  return NextResponse.json({
    ok: true,
    notified: (participants ?? []).length - failed,
    failed,
  });
}
