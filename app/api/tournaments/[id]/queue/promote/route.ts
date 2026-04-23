import { NextRequest, NextResponse } from "next/server";
import { getTournamentManager } from "@/lib/tournament-auth";
import { promoteMatchToCourt } from "@/lib/tournament-queue";

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
