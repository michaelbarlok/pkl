import { NextRequest, NextResponse } from "next/server";
import { getTournamentManager } from "@/lib/tournament-auth";
import { createServiceClient } from "@/lib/supabase/server";
import { notifyMany } from "@/lib/notify";
import { activateDivisionQueue, clearDivisionQueue } from "@/lib/tournament-queue";

/**
 * POST /api/tournaments/[id]/active-divisions
 *
 * Mark one or more divisions as active. Body:
 *   { divisions: string[] }  — explicit list
 *   { all: true }            — activate every division with registrants
 *
 * Side-effects per newly-activated division:
 *   1. Insert row into tournament_active_divisions (idempotent).
 *   2. Push + email registrants in that division: "Tournament has started".
 *   3. Prime the court-assignment queue (Phase 5).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: tournamentId } = await params;
  const auth = await getTournamentManager(tournamentId);
  if (!auth) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const wantsAll = body.all === true;
  const explicitDivisions: string[] = Array.isArray(body.divisions) ? body.divisions : [];

  const service = await createServiceClient();

  // Pull the tournament + its registration divisions so "all" is
  // accurate (only divisions with actual registrants need activation).
  const { data: tournament } = await auth.supabase
    .from("tournaments")
    .select("id, title, status, divisions")
    .eq("id", tournamentId)
    .single();
  if (!tournament) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (tournament.status !== "in_progress") {
    return NextResponse.json(
      { error: "Tournament must be in progress before divisions can be activated." },
      { status: 400 }
    );
  }

  // partner_id included so doubles partners get the "division is live"
  // push — not just the team anchor.
  const { data: regRows } = await service
    .from("tournament_registrations")
    .select("division, player_id, partner_id")
    .eq("tournament_id", tournamentId)
    .neq("status", "withdrawn");

  const divisionsWithRegistrants = Array.from(
    new Set((regRows ?? []).map((r: any) => r.division as string))
  );

  const targets = wantsAll
    ? divisionsWithRegistrants
    : explicitDivisions.filter((d) => divisionsWithRegistrants.includes(d));

  if (targets.length === 0) {
    return NextResponse.json({ error: "No valid divisions to activate." }, { status: 400 });
  }

  // Figure out which targets are NEW vs already active — only new
  // ones get notifications.
  const { data: alreadyActive } = await service
    .from("tournament_active_divisions")
    .select("division")
    .eq("tournament_id", tournamentId);
  const activeSet = new Set((alreadyActive ?? []).map((r: any) => r.division));
  const newlyActivated = targets.filter((d) => !activeSet.has(d));

  if (newlyActivated.length > 0) {
    const rows = newlyActivated.map((division) => ({
      tournament_id: tournamentId,
      division,
    }));
    const { error: insertErr } = await service
      .from("tournament_active_divisions")
      .insert(rows);
    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }
  }

  // Notify registrants of each newly-activated division. Include
  // both player_id (anchor) and partner_id (other half of the team)
  // so doubles partners are notified too.
  for (const division of newlyActivated) {
    const ids = new Set<string>();
    for (const r of (regRows ?? []) as { division: string; player_id: string; partner_id: string | null }[]) {
      if (r.division !== division) continue;
      if (r.player_id) ids.add(r.player_id);
      if (r.partner_id) ids.add(r.partner_id);
    }
    const playerIds = Array.from(ids);
    if (playerIds.length === 0) continue;

    await notifyMany(playerIds, {
      type: "tournament_division_started",
      title: `${tournament.title}: your division is live`,
      body: "Head to the Play tab to see your bracket and next match.",
      link: `/sessions/active`,
      emailTemplate: "TournamentAlert",
      emailData: {
        tournamentTitle: tournament.title,
        alertTitle: "Your tournament division is live",
        alertBody:
          "Your division has started. Open the app and tap the Play tab at the bottom to view your bracket, live standings, and your next match.",
        link: "/sessions/active",
      },
    });
  }

  // Kick the queue — puts newly-eligible matches on courts.
  await activateDivisionQueue(tournamentId);

  return NextResponse.json({
    ok: true,
    newly_activated: newlyActivated,
    already_active: targets.filter((d) => activeSet.has(d)),
  });
}

/**
 * DELETE /api/tournaments/[id]/active-divisions?division=X
 *
 * Deactivate a division (takes it out of the queue rotation). Matches
 * already on a court are left alone; no new assignments happen.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: tournamentId } = await params;
  const auth = await getTournamentManager(tournamentId);
  if (!auth) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const division = request.nextUrl.searchParams.get("division");
  if (!division) return NextResponse.json({ error: "division required" }, { status: 400 });

  const service = await createServiceClient();
  const { error } = await service
    .from("tournament_active_divisions")
    .delete()
    .eq("tournament_id", tournamentId)
    .eq("division", division);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Pull this division's queued matches out of the FIFO line so they
  // don't sneak onto a freshly-freed court. Matches already on a
  // court are left alone — the current game finishes normally.
  await clearDivisionQueue(tournamentId, division);

  return NextResponse.json({ ok: true });
}
