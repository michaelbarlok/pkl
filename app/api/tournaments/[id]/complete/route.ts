import { NextRequest, NextResponse } from "next/server";
import { getTournamentManager } from "@/lib/tournament-auth";
import { createServiceClient } from "@/lib/supabase/server";
import { notifyMany } from "@/lib/notify";
import { computeTournamentRecap } from "@/lib/tournament-recap";

/**
 * POST /api/tournaments/[id]/complete
 *
 * End-of-tournament handshake. Refuses to flip status to "completed"
 * unless every non-BYE match has a final score. Once the gate passes:
 *
 *   1. tournaments.status -> "completed"
 *   2. Delete every tournament_active_divisions row (divisions stop
 *      being "live" so they drop out of the Play tab / queue).
 *   3. Compute the recap and fan out notifications:
 *        - Per division: players in that division receive a recap
 *          with their own division rendered in full + top finishers
 *          from every other division.
 *        - Organizers (creator + co-organizers): one email with
 *          every division's full standings + playoff placements.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: tournamentId } = await params;
  const auth = await getTournamentManager(tournamentId);
  if (!auth) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const service = await createServiceClient();

  const { data: tournament } = await service
    .from("tournaments")
    .select("id, title, status, created_by, divisions")
    .eq("id", tournamentId)
    .single();
  if (!tournament) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (tournament.status === "completed") {
    return NextResponse.json({ ok: true, already_completed: true });
  }
  if (tournament.status === "cancelled") {
    return NextResponse.json(
      { error: "This tournament was cancelled — there's nothing to complete." },
      { status: 409 }
    );
  }

  // Gate: every match must be completed or a BYE. Anything pending
  // means scores are still outstanding — block until they're entered.
  const { data: outstandingMatches } = await service
    .from("tournament_matches")
    .select("id, division, round, match_number")
    .eq("tournament_id", tournamentId)
    .not("status", "in", "(completed,bye)");
  if ((outstandingMatches ?? []).length > 0) {
    return NextResponse.json(
      {
        error: `Cannot end the tournament — ${outstandingMatches!.length} match${outstandingMatches!.length === 1 ? "" : "es"} still need scores.`,
        outstanding: outstandingMatches,
      },
      { status: 400 }
    );
  }

  // Flip status + clear live-division state.
  await service
    .from("tournaments")
    .update({ status: "completed" })
    .eq("id", tournamentId);
  await service
    .from("tournament_active_divisions")
    .delete()
    .eq("tournament_id", tournamentId);

  // Build the recap payload once; we'll template it for each
  // recipient group below.
  const recap = await computeTournamentRecap(tournamentId);
  if (!recap) return NextResponse.json({ ok: true, recap: null });

  // Collect recipient lists. Pull partner_id too — doubles
  // registrations store one player per slot, so the recap needs to
  // fan out to BOTH teammates. Without this, partner-side players
  // never got their division recap.
  const { data: regs } = await service
    .from("tournament_registrations")
    .select("player_id, partner_id, division, status")
    .eq("tournament_id", tournamentId)
    .neq("status", "withdrawn");
  const playerIdsByDivision = new Map<string, Set<string>>();
  for (const r of (regs ?? []) as any[]) {
    if (!r.division) continue;
    const set = playerIdsByDivision.get(r.division) ?? new Set<string>();
    if (r.player_id) set.add(r.player_id);
    if (r.partner_id) set.add(r.partner_id);
    playerIdsByDivision.set(r.division, set);
  }

  const { data: organizerRows } = await service
    .from("tournament_organizers")
    .select("profile_id")
    .eq("tournament_id", tournamentId);
  const organizerIds = new Set<string>(
    (organizerRows ?? []).map((r: any) => r.profile_id)
  );
  if (tournament.created_by) organizerIds.add(tournament.created_by);

  // Per-division player fan-out. Excludes anyone also in the
  // organizer list — they'll get the fuller organizer email instead.
  for (const [division, playerIdSet] of playerIdsByDivision) {
    const targets = Array.from(playerIdSet).filter((pid) => !organizerIds.has(pid));
    if (targets.length === 0) continue;
    await notifyMany(targets, {
      type: "tournament_recap",
      title: `${recap.title}: final results`,
      body: "Your division's results and top finishers from every division.",
      link: `/tournaments/${tournamentId}`,
      emailTemplate: "TournamentRecap",
      emailData: {
        tournamentId: recap.tournamentId,
        tournamentTitle: recap.title,
        viewerRole: "player",
        myDivision: division,
        divisions: recap.divisions,
      },
    });
  }

  if (organizerIds.size > 0) {
    await notifyMany(Array.from(organizerIds), {
      type: "tournament_recap",
      title: `${recap.title}: final results`,
      body: "Full standings and playoff results for every division.",
      link: `/tournaments/${tournamentId}`,
      emailTemplate: "TournamentRecap",
      emailData: {
        tournamentId: recap.tournamentId,
        tournamentTitle: recap.title,
        viewerRole: "organizer",
        myDivision: null,
        divisions: recap.divisions,
      },
    });
  }

  return NextResponse.json({ ok: true });
}
