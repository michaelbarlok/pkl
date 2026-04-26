import { NextRequest, NextResponse } from "next/server";
import { getTournamentManager } from "@/lib/tournament-auth";
import { promoteMatchToCourt, runAssignmentPass } from "@/lib/tournament-queue";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * POST /api/tournaments/[id]/queue/promote
 *
 * Organizer manually sends a queued match to a specific open court.
 * Body: { match_id: string, court_number: number }.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: tournamentId } = await params;
  const auth = await getTournamentManager(tournamentId);
  if (!auth) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const matchId = typeof body.match_id === "string" ? body.match_id : "";
  const courtNumber = Number(body.court_number);
  if (!matchId || !Number.isFinite(courtNumber) || courtNumber < 1) {
    return NextResponse.json({ error: "match_id and court_number required" }, { status: 400 });
  }

  const result = await promoteMatchToCourt(tournamentId, matchId, Math.floor(courtNumber));
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

/**
 * DELETE /api/tournaments/[id]/queue/promote?match_id=<uuid>
 *
 * Pull an on-court match back into the queue — used when a team
 * isn't ready (injury, wrong pair, warmup needed). Organizer-only.
 *
 * The match re-enters the queue at POSITION 2 rather than the back:
 * the front-of-line match will get promoted to the now-empty court
 * by the assignment pass below, so to land at queue position 2
 * after that promotion we slot the bumped match between the SECOND
 * and THIRD queued matches (front+1ms would put it at position 1
 * once the front is promoted, which defeats the purpose). Score /
 * participants are untouched — this is a re-queue, not a cancel.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: tournamentId } = await params;
  const auth = await getTournamentManager(tournamentId);
  if (!auth) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const matchId = request.nextUrl.searchParams.get("match_id");
  if (!matchId) {
    return NextResponse.json({ error: "match_id required" }, { status: 400 });
  }

  const service = await createServiceClient();
  const { data: match } = await service
    .from("tournament_matches")
    .select("id, tournament_id, status, court_number, queued_court_set")
    .eq("id", matchId)
    .eq("tournament_id", tournamentId)
    .single();
  if (!match) return NextResponse.json({ error: "Match not found" }, { status: 404 });
  if (match.status !== "pending" || match.court_number == null) {
    return NextResponse.json(
      { error: "Match isn't currently on a court" },
      { status: 409 }
    );
  }

  // The "queue" we operate on is range-scoped — every match that
  // shares the bumped match's `queued_court_set` snapshot, i.e.
  // the cohort competing for the same set of courts. Without this
  // scoping, a global re-stamp would put cross-range matches at
  // queue positions 1 and 2, and runAssignmentPass would skip
  // those (they can't take the freed in-range court) and slot the
  // bumped match RIGHT BACK on the same court — visually a no-op,
  // which is exactly what the organizer was reporting.
  //
  // JSON-stringify the snapshot for a stable equality key. NULL
  // snapshot (legacy / pre-column matches) groups with other NULL
  // snapshots and falls through to the global behavior.
  const scopeKey = match.queued_court_set
    ? JSON.stringify(match.queued_court_set)
    : null;

  const { data: queuedRaw } = await service
    .from("tournament_matches")
    .select("id, queued_court_set")
    .eq("tournament_id", tournamentId)
    .eq("status", "pending")
    .is("court_number", null)
    .not("queue_entered_at", "is", null)
    .neq("id", matchId)
    .order("queue_entered_at", { ascending: true });
  const queued = ((queuedRaw ?? []) as { id: string; queued_court_set: number[] | null }[])
    .filter((q) => {
      const k = q.queued_court_set ? JSON.stringify(q.queued_court_set) : null;
      return k === scopeKey;
    });

  // Pre-promotion order should be [Q1, Q2, BUMPED, Q3, Q4, …] so
  // that after runAssignmentPass promotes Q1 to the just-vacated
  // court, the bumped match sits at position 2 of the remaining
  // in-range queue. Insert at index 2 (after Q1 and Q2). If the
  // queue has fewer than 2 entries, insert at the end — bumped is
  // the only remaining queued match in this range anyway.
  const insertAt = Math.min(2, queued.length);
  const newOrder = [
    ...queued.slice(0, insertAt).map((q) => q.id),
    matchId,
    ...queued.slice(insertAt).map((q) => q.id),
  ];

  // Re-stamp ONLY the in-scope matches at consecutive 1ms ticks.
  // Cross-range matches keep their original timestamps so their
  // own queue ordering is preserved. The bumped match also gets
  // its court_number cleared and its notification ack columns
  // reset since its position context changed. Updates run in
  // parallel — each touches a single row.
  const baseMs = Date.now();
  await Promise.all(
    newOrder.map((id, i) => {
      const stamp = new Date(baseMs + i).toISOString();
      const isBumped = id === matchId;
      return service
        .from("tournament_matches")
        .update(
          isBumped
            ? {
                queue_entered_at: stamp,
                court_number: null,
                up_next_notified_at: null,
                in_3rd_notified_at: null,
              }
            : { queue_entered_at: stamp }
        )
        .eq("id", id);
    })
  );

  await runAssignmentPass(tournamentId);
  return NextResponse.json({ ok: true });
}
