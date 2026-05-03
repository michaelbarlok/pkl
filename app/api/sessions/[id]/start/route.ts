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
import { buildSessionFirstChoiceMap } from "@/lib/session-first-choice";
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
    .select("id, status, group_id, current_round, group:shootout_groups(name)")
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

  // Build the session-wide first-choice map so each player's push can
  // tell them whether their team has first choice on game 1 of their
  // court. Cross-round seeding (from past games) is folded in
  // automatically for round 2+ Play Again starts.
  const currentRound = (session as { current_round?: number }).current_round ?? 1;
  const { data: gameRows } = await serviceClient
    .from("game_results")
    .select("round_number, pool_number, team_a_p1, team_a_p2, team_b_p1, team_b_p2")
    .eq("session_id", sessionId);
  const firstChoiceMap = buildSessionFirstChoiceMap(
    sessionId,
    currentRound,
    (participants ?? []).map((p) => ({
      player_id: p.player_id,
      court_number: p.court_number ?? null,
    })),
    gameRows ?? [],
  );

  // Cache the sorted player ids for each court so we can decide which
  // team a player is on for game 1 (4-player: top two = team1; bottom
  // two = team2; same for 5-player with the 5th sitting out G1).
  const courtRosters = new Map<number, string[]>();
  for (const p of participants ?? []) {
    if (p.court_number == null) continue;
    const arr = courtRosters.get(p.court_number) ?? [];
    arr.push(p.player_id);
    courtRosters.set(p.court_number, arr);
  }
  for (const [court, ids] of courtRosters) {
    courtRosters.set(court, [...ids].sort());
  }

  function game1TeamFor(playerId: string, courtNumber: number): "team1" | "team2" | null {
    const sorted = courtRosters.get(courtNumber);
    if (!sorted) return null;
    const idx = sorted.indexOf(playerId);
    if (idx < 0) return null;
    if (sorted.length === 4) {
      // G1: team1 = [a, b], team2 = [c, d]
      return idx <= 1 ? "team1" : "team2";
    }
    if (sorted.length === 5) {
      // G1: team1 = [a, b], team2 = [c, d], bye = e
      if (idx <= 1) return "team1";
      if (idx <= 3) return "team2";
      return null;
    }
    return null;
  }

  // Parallelize the notify() calls — notify() internally writes an
  // in-app row + optionally sends push/email. Concurrency keeps the
  // request fast even for a 30-person session.
  const results = await Promise.allSettled(
    (participants ?? []).map((p) => {
      const courtSegment =
        p.court_number != null
          ? `Head to Court ${p.court_number}!`
          : "Session started — check the app for your court.";

      let firstChoiceLine = "";
      if (p.court_number != null) {
        const myTeam = game1TeamFor(p.player_id, p.court_number);
        const fcPick = firstChoiceMap.get(`${currentRound}:${p.court_number}:1`);
        if (myTeam && fcPick) {
          firstChoiceLine =
            myTeam === fcPick
              ? " You have first choice on Game 1."
              : " Opponents have first choice on Game 1.";
        }
      }

      return notify({
        profileId: p.player_id,
        type: "pool_assigned",
        title: `Session started: ${groupName}`,
        body: `${courtSegment}${firstChoiceLine}`,
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
