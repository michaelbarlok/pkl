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
 * Pull an on-court match back into the queue — e.g. injury, wrong
 * team showed up, or the organizer reconsidered. The match's
 * court_number is cleared and queue_entered_at is refreshed so the
 * match re-enters the FIFO line at the back. The freed court is
 * then fed by the normal assignment pass. Score / participants are
 * untouched — this is a re-queue, not a cancel.
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

  // Re-queue at the back of the line (fresh queue_entered_at) so
  // this match doesn't jump ahead of others already waiting. The
  // assignment pass will fill the freed court from the front of
  // the line.
  await service
    .from("tournament_matches")
    .update({ court_number: null, queue_entered_at: new Date().toISOString() })
    .eq("id", matchId);

  await runAssignmentPass(tournamentId);
  return NextResponse.json({ ok: true });
}
