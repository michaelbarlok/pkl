import { NextRequest, NextResponse } from "next/server";
import { getTournamentManager } from "@/lib/tournament-auth";
import { onMatchCompleted } from "@/lib/tournament-queue";
import { getPlayoffAdvancement } from "@/lib/tournament-bracket";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * POST /api/tournaments/[id]/forfeit
 *
 * Two flavors:
 *
 *   1. Match-only forfeit (default for playoffs, opt-in for pool):
 *      The forfeiting team keeps whatever points they had at forfeit
 *      time; the other team is awarded the win at the division's
 *      target score. The match is finalized normally and the queue
 *      advances. Playoff bracket advancement (winner moves to next
 *      round) runs the same as a regular score recording.
 *
 *   2. Tournament forfeit (pool play only — typically injury or
 *      emergency): the team is yanked out of the pool entirely. Every
 *      pool match they appear in — completed or not — is deleted, so
 *      the pool standings recompute as if they were never in it. The
 *      registration is marked withdrawn so the team can't re-enter
 *      automatically. If any of their matches were on a court, that
 *      court frees up via the queue advance at the end.
 *
 * Body:
 *   match_id: string
 *   forfeiting_anchor: "player1" | "player2"
 *   current_score: number   // points the forfeiting team had earned;
 *                              ignored for tournament forfeit
 *   entire_tournament: boolean
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: tournamentId } = await params;
  const auth = await getTournamentManager(tournamentId);
  if (!auth) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const matchId = typeof body.match_id === "string" ? body.match_id : "";
  const forfeitingAnchor =
    body.forfeiting_anchor === "player1" || body.forfeiting_anchor === "player2"
      ? (body.forfeiting_anchor as "player1" | "player2")
      : null;
  const currentScore = Number.isFinite(body.current_score)
    ? Math.max(0, Math.floor(body.current_score))
    : 0;
  const entireTournament = body.entire_tournament === true;

  if (!matchId || !forfeitingAnchor) {
    return NextResponse.json(
      { error: "match_id and forfeiting_anchor required" },
      { status: 400 }
    );
  }

  const service = await createServiceClient();

  const { data: match } = await service
    .from("tournament_matches")
    .select("*")
    .eq("id", matchId)
    .eq("tournament_id", tournamentId)
    .single();
  if (!match) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }
  if (match.status === "completed") {
    return NextResponse.json(
      { error: "Match is already completed — edit the score instead." },
      { status: 409 }
    );
  }
  if (match.bracket === "bye") {
    return NextResponse.json({ error: "Can't forfeit a BYE." }, { status: 400 });
  }

  const forfeitAnchor =
    forfeitingAnchor === "player1" ? match.player1_id : match.player2_id;
  const winningAnchor =
    forfeitingAnchor === "player1" ? match.player2_id : match.player1_id;
  if (!forfeitAnchor || !winningAnchor) {
    return NextResponse.json(
      { error: "Both teams must be set on the match before a forfeit." },
      { status: 400 }
    );
  }

  const isPool =
    typeof match.bracket === "string" && match.bracket.startsWith("pool_");
  if (entireTournament && !isPool) {
    return NextResponse.json(
      {
        error:
          "Tournament forfeit isn't available for playoff matches — use match-only forfeit.",
      },
      { status: 400 }
    );
  }

  if (entireTournament) {
    // Pool tournament forfeit: void every match in this pool involving
    // the forfeiting team, regardless of completion state. Standings
    // re-derive from whatever matches remain — i.e., the pool plays
    // out as if the team never existed.
    await service
      .from("tournament_matches")
      .delete()
      .eq("tournament_id", tournamentId)
      .eq("division", match.division)
      .eq("bracket", match.bracket)
      .or(
        `player1_id.eq.${forfeitAnchor},player2_id.eq.${forfeitAnchor}`
      );

    // Mark the registration withdrawn so they can't be auto-re-pulled
    // into the pool by a regenerate or anything similar.
    await service
      .from("tournament_registrations")
      .update({ status: "withdrawn" })
      .eq("tournament_id", tournamentId)
      .eq("division", match.division)
      .eq("player_id", forfeitAnchor);
  } else {
    // Match-only forfeit. Pull the target score (per division override
    // first, tournament default second) so the forfeit score reads
    // exactly like a normal completion would have.
    const { data: tournament } = await service
      .from("tournaments")
      .select(
        "score_to_win_pool, score_to_win_playoff, division_settings"
      )
      .eq("id", tournamentId)
      .single();

    const divisionOverrides =
      (tournament?.division_settings as
        | Record<
            string,
            { score_to_win_pool?: number; score_to_win_playoff?: number } | null
          >
        | null
        | undefined)?.[match.division ?? ""] ?? null;

    const targetScore =
      (isPool
        ? divisionOverrides?.score_to_win_pool ?? tournament?.score_to_win_pool
        : divisionOverrides?.score_to_win_playoff ??
          tournament?.score_to_win_playoff) ?? 11;

    // Cap the forfeiting team's score one below target so they can't
    // be recorded as having "won" through forfeit math.
    const forfeitScore = Math.min(currentScore, targetScore - 1);
    const score1 = forfeitingAnchor === "player1" ? [forfeitScore] : [targetScore];
    const score2 = forfeitingAnchor === "player2" ? [forfeitScore] : [targetScore];

    await service
      .from("tournament_matches")
      .update({
        status: "completed",
        score1,
        score2,
        winner_id: winningAnchor,
        court_number: null,
        queue_entered_at: null,
      })
      .eq("id", matchId);

    // Playoff winner advancement — mirror the bracket route's logic so
    // a match-only forfeit moves the winner forward exactly as a
    // normal completion would.
    if (match.bracket === "playoff") {
      const { data: allPlayoff } = await service
        .from("tournament_matches")
        .select("id, round, match_number")
        .eq("tournament_id", tournamentId)
        .eq("bracket", "playoff")
        .eq("division", match.division ?? "");

      if (allPlayoff && allPlayoff.length > 0) {
        const adv = getPlayoffAdvancement(
          { round: match.round, match_number: match.match_number },
          allPlayoff.map((m) => ({
            round: m.round as number,
            match_number: m.match_number as number,
          }))
        );
        if (adv.winner) {
          const target = allPlayoff.find(
            (m) =>
              m.round === adv.winner!.round &&
              m.match_number === adv.winner!.match_number
          );
          if (target) {
            await service
              .from("tournament_matches")
              .update({ [adv.winner.slot]: winningAnchor })
              .eq("id", target.id);
          }
        }
        // SF loser → 3rd place game. Forfeiting in a SF means the
        // forfeiting team is the loser, so route them into the 3rd
        // place game just like a normal SF loss would.
        if (adv.loser) {
          const target = allPlayoff.find(
            (m) =>
              m.round === adv.loser!.round &&
              m.match_number === adv.loser!.match_number
          );
          if (target) {
            await service
              .from("tournament_matches")
              .update({ [adv.loser.slot]: forfeitAnchor })
              .eq("id", target.id);
          }
        }
      }
    }
  }

  // Advance the queue: in the entire-tournament path this can free a
  // court if one of the deleted matches was on it; in the match-only
  // path it covers the just-cleared court_number.
  try {
    await onMatchCompleted(tournamentId);
  } catch (err) {
    console.error("forfeit: onMatchCompleted failed", err);
  }

  return NextResponse.json({ ok: true });
}
