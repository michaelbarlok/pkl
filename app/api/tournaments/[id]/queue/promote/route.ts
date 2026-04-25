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

  // Pull the top of the queue (we need three so we can slot the
  // bumped match BETWEEN the post-promotion-position-1 and -2
  // matches). Cross-division because queue_entered_at is the merged
  // FIFO ordering across every active division — that's what the
  // Court Tracker / Match Queue display reads from.
  const { data: topQueued } = await service
    .from("tournament_matches")
    .select("queue_entered_at")
    .eq("tournament_id", tournamentId)
    .eq("status", "pending")
    .is("court_number", null)
    .not("queue_entered_at", "is", null)
    .neq("id", matchId)
    .order("queue_entered_at", { ascending: true })
    .limit(3);

  const top = (topQueued ?? []) as { queue_entered_at: string }[];
  // Pick the new stamp:
  //  - 3+ queued: midpoint between top[1] (becomes post-promotion
  //    position 1) and top[2] (becomes position 2). Midpoint
  //    guarantees we land strictly between them; the previous
  //    "top[1]+1ms" collided with top[2] when stamps were 1ms apart
  //    (which is the default — runAssignmentPass writes consecutive
  //    1ms ticks), and the unstable sort then put the bumped match
  //    at position 3 or further instead of 2.
  //  - 2 queued: just past top[1] — bumped will be alone behind it
  //    after the promotion.
  //  - 1 queued: just past top[0].
  //  - 0 queued: anchor on now (bumped refills its own court).
  let newStampMs: number;
  if (top.length >= 3) {
    const t2 = new Date(top[1].queue_entered_at).getTime();
    const t3 = new Date(top[2].queue_entered_at).getTime();
    newStampMs = (t2 + t3) / 2;
  } else if (top.length === 2) {
    newStampMs = new Date(top[1].queue_entered_at).getTime() + 1;
  } else if (top.length === 1) {
    newStampMs = new Date(top[0].queue_entered_at).getTime() + 1;
  } else {
    newStampMs = Date.now();
  }
  const newStamp = isoWithMicros(newStampMs);

  await service
    .from("tournament_matches")
    .update({
      court_number: null,
      queue_entered_at: newStamp,
      up_next_notified_at: null,
      in_3rd_notified_at: null,
    })
    .eq("id", matchId);

  await runAssignmentPass(tournamentId);
  return NextResponse.json({ ok: true });
}

/**
 * ISO-8601 with microsecond precision. Date.toISOString() truncates
 * to milliseconds; PostgreSQL timestamptz stores microseconds, so
 * we need to inject the extra 3 digits ourselves to express a value
 * like "halfway between two 1ms-apart stamps". Accepts a fractional
 * ms input (e.g. 1234567890101.5 → "...T...:01.101500Z").
 */
function isoWithMicros(ms: number): string {
  const intMs = Math.floor(ms);
  const microsFrac = Math.round((ms - intMs) * 1000); // 0..999
  const base = new Date(intMs).toISOString(); // "...T...:01.234Z"
  return base.replace(
    "Z",
    String(microsFrac).padStart(3, "0") + "Z"
  );
}
