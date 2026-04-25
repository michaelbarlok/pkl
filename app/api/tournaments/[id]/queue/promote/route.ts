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

  // Pull the top of the queue. We want the bumped match to land at
  // position 2 of the POST-promotion queue: after the front-of-line
  // match gets sent to the now-empty court, queue[0] (was second)
  // stays at position 1 and the bumped match should sit immediately
  // behind it. So we anchor the new timestamp to the SECOND queued
  // match's stamp +1ms. Edge cases:
  //   - 0 queued: nothing to land behind, stamp = now (bumped will
  //     refill the just-vacated court anyway).
  //   - 1 queued: only one match ahead; bumped sits after it (stamp
  //     = front+1ms), ending at position 1 of the post-promotion
  //     queue (queue is just the bumped match; nothing else to put
  //     it behind).
  const { data: topQueued } = await service
    .from("tournament_matches")
    .select("queue_entered_at")
    .eq("tournament_id", tournamentId)
    .eq("status", "pending")
    .is("court_number", null)
    .not("queue_entered_at", "is", null)
    .neq("id", matchId)
    .order("queue_entered_at", { ascending: true })
    .limit(2);

  const top = (topQueued ?? []) as { queue_entered_at: string }[];
  const anchorStamp = top[1]?.queue_entered_at ?? top[0]?.queue_entered_at;
  const anchorMs = anchorStamp
    ? new Date(anchorStamp).getTime() + 1
    : Date.now();
  const newStamp = new Date(anchorMs).toISOString();

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
