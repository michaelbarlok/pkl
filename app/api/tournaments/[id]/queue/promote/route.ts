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
 * we set its queue_entered_at to just after the current front-of-line
 * match, giving the bumped team roughly one more match's worth of
 * warmup time before they have to step on the court again. Score /
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

  // Find the current front-of-line queued match. If none, there's
  // nothing ahead anyway — stamping "now" puts this match first,
  // which is fine (no other match to buy time against).
  const { data: frontOfLine } = await service
    .from("tournament_matches")
    .select("queue_entered_at")
    .eq("tournament_id", tournamentId)
    .eq("status", "pending")
    .is("court_number", null)
    .not("queue_entered_at", "is", null)
    .neq("id", matchId)
    .order("queue_entered_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  // New timestamp = 1ms after the current front match so the bumped
  // match sits at position 2. If the queue is empty, "now" is fine.
  // Also clear up_next / in_3rd ack columns since the match's
  // notification context changed.
  const frontTs = frontOfLine?.queue_entered_at
    ? new Date(frontOfLine.queue_entered_at).getTime() + 1
    : Date.now();
  const newStamp = new Date(frontTs).toISOString();

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
