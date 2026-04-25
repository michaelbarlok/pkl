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
    .select("id, tournament_id, status, court_number")
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

  // Treat the queue like an explicit ordered array: read every
  // queued match (excluding the bumped one), splice the bumped match
  // in at the position-2 slot of the post-promotion queue, then
  // re-stamp the whole list with fresh, strictly-increasing 1ms
  // ticks. This is the definitive ordering — no leaning on existing
  // stamps that might collide, no microsecond hacks. Cross-division
  // because queue_entered_at is the merged FIFO ordering across
  // every active division (Court Tracker reads it that way).
  const { data: queuedRaw } = await service
    .from("tournament_matches")
    .select("id")
    .eq("tournament_id", tournamentId)
    .eq("status", "pending")
    .is("court_number", null)
    .not("queue_entered_at", "is", null)
    .neq("id", matchId)
    .order("queue_entered_at", { ascending: true });
  const queued = (queuedRaw ?? []) as { id: string }[];

  // Pre-promotion order should be [Q1, Q2, BUMPED, Q3, Q4, …] so
  // that after runAssignmentPass promotes Q1 to the just-vacated
  // court, the bumped match sits at position 2 of the remaining
  // queue. Insert at index 2 (after Q1 and Q2). If the queue has
  // fewer than 2 entries, insert at the end — bumped is the only
  // remaining queued match anyway.
  const insertAt = Math.min(2, queued.length);
  const newOrder = [
    ...queued.slice(0, insertAt).map((q) => q.id),
    matchId,
    ...queued.slice(insertAt).map((q) => q.id),
  ];

  // Re-stamp every queued match at consecutive 1ms ticks. The
  // bumped match also gets its court_number cleared and its
  // notification ack columns reset since its position context
  // changed. Updates run in parallel — each touches a single row.
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
