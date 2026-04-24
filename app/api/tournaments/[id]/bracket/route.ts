import { NextRequest, NextResponse } from "next/server";
import {
  generateSingleElimination,
  generateDoubleElimination,
  generateRoundRobin,
} from "@/lib/tournament-bracket";
import { getTournamentManager } from "@/lib/tournament-auth";
import { onMatchCompleted } from "@/lib/tournament-queue";

/**
 * POST: Generate bracket and advance tournament to in_progress.
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
  const supabase = auth.supabase;

  // Fetch tournament
  const { data: tournament } = await supabase
    .from("tournaments")
    .select("*")
    .eq("id", tournamentId)
    .single();

  if (!tournament) {
    return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
  }

  if (tournament.status !== "registration_closed") {
    return NextResponse.json(
      { error: "Tournament must be in registration_closed status to generate bracket" },
      { status: 400 }
    );
  }

  // Fetch confirmed registrations ordered by seed (if set) then registration order
  const { data: registrations } = await supabase
    .from("tournament_registrations")
    .select("player_id, seed")
    .eq("tournament_id", tournamentId)
    .eq("status", "confirmed")
    .order("seed", { ascending: true, nullsFirst: false })
    .order("registered_at", { ascending: true });

  if (!registrations || registrations.length < 2) {
    return NextResponse.json({ error: "Need at least 2 registrations" }, { status: 400 });
  }

  const playerIds = registrations.map((r) => r.player_id);

  // Generate bracket based on format
  let bracketMatches;
  switch (tournament.format) {
    case "single_elimination":
      bracketMatches = generateSingleElimination(playerIds);
      break;
    case "double_elimination":
      bracketMatches = generateDoubleElimination(playerIds);
      break;
    case "round_robin":
      bracketMatches = generateRoundRobin(playerIds);
      break;
    default:
      return NextResponse.json({ error: "Unknown format" }, { status: 400 });
  }

  // Delete any existing matches (in case of regeneration)
  await supabase
    .from("tournament_matches")
    .delete()
    .eq("tournament_id", tournamentId);

  // Insert all matches
  const matchInserts = bracketMatches.map((m) => ({
    tournament_id: tournamentId,
    round: m.round,
    match_number: m.match_number,
    bracket: m.bracket,
    player1_id: m.player1_id,
    player2_id: m.player2_id,
    status: m.status,
    score1: [],
    score2: [],
  }));

  const { error: insertError } = await supabase
    .from("tournament_matches")
    .insert(matchInserts);

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  // Auto-advance bye matches: if one player is null, the other wins
  // Only for elimination brackets — in round robin, byes simply skip (no stats recorded)
  if (tournament.format !== "round_robin") {
    const byeMatches = bracketMatches.filter((m) => m.status === "bye");
    for (const bye of byeMatches) {
      const winnerId = bye.player1_id || bye.player2_id;
      if (winnerId) {
        await supabase
          .from("tournament_matches")
          .update({ winner_id: winnerId, status: "completed" })
          .eq("tournament_id", tournamentId)
          .eq("round", bye.round)
          .eq("match_number", bye.match_number)
          .eq("bracket", bye.bracket);
      }
    }
  }

  // Advance tournament status
  await supabase
    .from("tournaments")
    .update({ status: "in_progress" })
    .eq("id", tournamentId);

  return NextResponse.json({ matches: matchInserts.length });
}

/**
 * PUT: Record a match score and advance winner.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: tournamentId } = await params;
  const auth = await getTournamentManager(tournamentId);
  if (!auth) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  const supabase = auth.supabase;

  const body = await request.json();
  const { match_id, score1, score2, winner_id } = body;

  // Validate
  if (!match_id || !winner_id) {
    return NextResponse.json({ error: "match_id and winner_id required" }, { status: 400 });
  }

  // Score sanity. Scores are arrays (one entry per game, supports
  // best-of-3). Minimum standard: both arrays same length, at least
  // one game recorded, non-negative, not a 0-0 draw, and the
  // declared winner must actually have won the majority of games.
  const s1 = Array.isArray(score1) ? score1.map(Number) : [];
  const s2 = Array.isArray(score2) ? score2.map(Number) : [];
  if (s1.length !== s2.length) {
    return NextResponse.json({ error: "score1 and score2 must have the same number of games" }, { status: 400 });
  }
  if (s1.length === 0) {
    return NextResponse.json({ error: "Record at least one game score" }, { status: 400 });
  }
  if (s1.some((n) => !Number.isFinite(n) || n < 0) || s2.some((n) => !Number.isFinite(n) || n < 0)) {
    return NextResponse.json({ error: "Scores must be non-negative numbers" }, { status: 400 });
  }
  if (s1.every((n, i) => n === 0 && s2[i] === 0)) {
    return NextResponse.json({ error: "Scores cannot all be 0-0" }, { status: 400 });
  }

  // Fetch tournament format
  const { data: tournament } = await supabase
    .from("tournaments")
    .select("format")
    .eq("id", tournamentId)
    .single();

  if (!tournament) {
    return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
  }

  // Fetch existing match state to detect edits (winner change)
  const { data: existingMatch } = await supabase
    .from("tournament_matches")
    .select("*")
    .eq("id", match_id)
    .single();

  if (!existingMatch) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }

  // Winner must be one of the two players on the match.
  if (winner_id !== existingMatch.player1_id && winner_id !== existingMatch.player2_id) {
    return NextResponse.json({ error: "winner_id must match player1_id or player2_id" }, { status: 400 });
  }

  // Winner's per-game wins must be the majority. Ties (same score)
  // count toward neither team, so they must be broken in the data.
  let p1Wins = 0;
  let p2Wins = 0;
  for (let i = 0; i < s1.length; i++) {
    if (s1[i] > s2[i]) p1Wins++;
    else if (s2[i] > s1[i]) p2Wins++;
  }
  if (p1Wins === p2Wins) {
    return NextResponse.json({ error: "Scores don't clearly determine a winner — check for tied games" }, { status: 400 });
  }
  const inferredWinner = p1Wins > p2Wins ? existingMatch.player1_id : existingMatch.player2_id;
  if (inferredWinner !== winner_id) {
    return NextResponse.json({ error: "winner_id doesn't match the scores" }, { status: 400 });
  }

  const previousWinner = existingMatch.status === "completed" ? existingMatch.winner_id : null;
  const previousLoser = previousWinner
    ? (existingMatch.player1_id === previousWinner ? existingMatch.player2_id : existingMatch.player1_id)
    : null;
  const isEdit = previousWinner !== null;
  const winnerChanged = isEdit && previousWinner !== winner_id;

  // Update match score — also free the court so the assignment
  // engine can hand it to the next queued match, and null out
  // queue_entered_at so an in-queue match scored directly from the
  // bracket view (skipping the court) gets cleanly removed from
  // the queue. Optimistic lock on `updated_at`: if another organizer
  // wrote the same match between our fetch and our write, the row
  // returned will be empty and we return 409 so the caller can refetch.
  const { data: match, error: updateError } = await supabase
    .from("tournament_matches")
    .update({
      score1: s1,
      score2: s2,
      winner_id,
      status: "completed",
      court_number: null,
      queue_entered_at: null,
    })
    .eq("id", match_id)
    .eq("updated_at", existingMatch.updated_at)
    .select()
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }
  if (!match) {
    return NextResponse.json(
      { error: "Match was updated by someone else. Reload and try again." },
      { status: 409 }
    );
  }

  // Auto-advance winner to next match in bracket (scoped to same division)
  if (match.bracket === "winners" || match.bracket === "grand_final") {
    const nextRound = match.round + 1;
    const nextMatchNumber = Math.ceil(match.match_number / 2);
    const slot = match.match_number % 2 === 1 ? "player1_id" : "player2_id";

    let nextMatchQuery = supabase
      .from("tournament_matches")
      .select("id")
      .eq("tournament_id", tournamentId)
      .eq("round", nextRound)
      .eq("match_number", nextMatchNumber)
      .eq("bracket", match.bracket);

    // Scope to same division if set
    if (match.division) {
      nextMatchQuery = nextMatchQuery.eq("division", match.division);
    }

    const { data: nextMatch } = await nextMatchQuery.single();

    if (nextMatch) {
      await supabase
        .from("tournament_matches")
        .update({ [slot]: winner_id })
        .eq("id", nextMatch.id);
    }
  }

  // Playoff bracket advancement (winner → next round, SF losers → 3rd place)
  if (match.bracket === "playoff") {
    // Get all playoff matches for this division to determine max round
    let playoffQuery = supabase
      .from("tournament_matches")
      .select("round, match_number, id")
      .eq("tournament_id", tournamentId)
      .eq("bracket", "playoff");

    if (match.division) {
      playoffQuery = playoffQuery.eq("division", match.division);
    }

    const { data: allPlayoff } = await playoffQuery;

    if (allPlayoff && allPlayoff.length > 0) {
      const maxRound = Math.max(...allPlayoff.map((m: any) => m.round));
      const isSemifinalRound = match.round === maxRound - 1;
      const isFinalRound = match.round >= maxRound;

      // Determine loser
      const loserId = match.player1_id === winner_id ? match.player2_id : match.player1_id;

      if (!isFinalRound) {
        // Winner advancement
        if (isSemifinalRound) {
          // SF winners → final (match 1 in max round)
          const winnerSlot = match.match_number % 2 === 1 ? "player1_id" : "player2_id";
          const finalMatch = allPlayoff.find(
            (m: any) => m.round === maxRound && m.match_number === 1
          );
          if (finalMatch) {
            await supabase
              .from("tournament_matches")
              .update({ [winnerSlot]: winner_id })
              .eq("id", finalMatch.id);
          }

          // SF losers → 3rd place game (match 2 in max round)
          if (loserId) {
            const loserSlot = match.match_number % 2 === 1 ? "player1_id" : "player2_id";
            const thirdPlaceMatch = allPlayoff.find(
              (m: any) => m.round === maxRound && m.match_number === 2
            );
            if (thirdPlaceMatch) {
              await supabase
                .from("tournament_matches")
                .update({ [loserSlot]: loserId })
                .eq("id", thirdPlaceMatch.id);
            }
          }
        } else {
          // Earlier rounds: standard single-elim advancement
          // Check if this is the 6-team QF layout (2 QF matches feed into 2 SF matches 1:1)
          const matchesInThisRound = allPlayoff.filter(
            (m: any) => m.round === match.round
          ).length;
          const matchesInNextRound = allPlayoff.filter(
            (m: any) => m.round === match.round + 1
          ).length;
          const isSixTeamQF = matchesInThisRound === 2 && matchesInNextRound === 2;

          if (isSixTeamQF) {
            // 6-team bracket: R1M1 winner → R2M1 player2, R1M2 winner → R2M2 player2
            const sfMatch = allPlayoff.find(
              (m: any) => m.round === match.round + 1 && m.match_number === match.match_number
            );
            if (sfMatch) {
              await supabase
                .from("tournament_matches")
                .update({ player2_id: winner_id })
                .eq("id", sfMatch.id);
            }
          } else {
            // Standard bracket: advance to ceil(matchNumber/2) in next round
            const nextMatchNumber = Math.ceil(match.match_number / 2);
            const slot = match.match_number % 2 === 1 ? "player1_id" : "player2_id";
            const nextMatch = allPlayoff.find(
              (m: any) => m.round === match.round + 1 && m.match_number === nextMatchNumber
            );
            if (nextMatch) {
              await supabase
                .from("tournament_matches")
                .update({ [slot]: winner_id })
                .eq("id", nextMatch.id);
            }
          }
        }
      }
    }
  }

  // If editing a completed match and the winner changed, fix downstream slots
  // Replace old winner/loser references in later rounds with new winner/loser
  if (winnerChanged && (match.bracket === "winners" || match.bracket === "playoff" || match.bracket === "grand_final")) {
    const newLoser = match.player1_id === winner_id ? match.player2_id : match.player1_id;

    // Find all matches in later rounds of the same bracket/division
    let laterQuery = supabase
      .from("tournament_matches")
      .select("id, player1_id, player2_id, winner_id, status, round")
      .eq("tournament_id", tournamentId)
      .eq("bracket", match.bracket)
      .gt("round", match.round);

    if (match.division) {
      laterQuery = laterQuery.eq("division", match.division);
    }

    const { data: laterMatches } = await laterQuery;
    if (laterMatches) {
      for (const lm of laterMatches) {
        const updates: Record<string, string | null> = {};

        // Swap old winner → new winner in player slots
        if (lm.player1_id === previousWinner) updates.player1_id = winner_id;
        if (lm.player2_id === previousWinner) updates.player2_id = winner_id;
        // Swap old loser → new loser in player slots (for 3rd place routing)
        if (previousLoser && newLoser) {
          if (lm.player1_id === previousLoser) updates.player1_id = newLoser;
          if (lm.player2_id === previousLoser) updates.player2_id = newLoser;
        }
        // If the later match recorded old winner as the winner, update that too
        if (lm.winner_id === previousWinner) updates.winner_id = winner_id;

        if (Object.keys(updates).length > 0) {
          await supabase
            .from("tournament_matches")
            .update(updates)
            .eq("id", lm.id);
        }
      }
    }

    // Also handle cross-bracket: playoff 3rd place game references from SF losers
    if (match.bracket === "playoff") {
      let thirdPlaceQuery = supabase
        .from("tournament_matches")
        .select("id, player1_id, player2_id, winner_id")
        .eq("tournament_id", tournamentId)
        .eq("bracket", "playoff")
        .gt("round", match.round);

      if (match.division) {
        thirdPlaceQuery = thirdPlaceQuery.eq("division", match.division);
      }

      // Already handled above via laterMatches for same bracket
    }
  }

  // Check if tournament is complete
  // For round robin: all divisions must have playoff matches AND all matches must be completed
  // For other formats: all matches must be completed
  const { data: pendingMatches } = await supabase
    .from("tournament_matches")
    .select("id")
    .eq("tournament_id", tournamentId)
    .in("status", ["pending", "in_progress"])
    .limit(1);

  if (!pendingMatches || pendingMatches.length === 0) {
    // For round robin, also check that all divisions have entered playoffs
    let canComplete = true;
    if (tournament.format === "round_robin") {
      const { data: tournamentData } = await supabase
        .from("tournaments")
        .select("divisions")
        .eq("id", tournamentId)
        .single();

      if (tournamentData?.divisions) {
        const divisions = tournamentData.divisions as string[];
        for (const div of divisions) {
          const { data: playoffCheck } = await supabase
            .from("tournament_matches")
            .select("id")
            .eq("tournament_id", tournamentId)
            .eq("division", div)
            .eq("bracket", "playoff")
            .limit(1);

          if (!playoffCheck || playoffCheck.length === 0) {
            canComplete = false;
            break;
          }
        }
      }
    }

    if (canComplete) {
      await supabase
        .from("tournaments")
        .update({ status: "completed" })
        .eq("id", tournamentId);
    }
  }

  // Promote the next queued match to the freed court (if any). Fire
  // and forget — a failure in the engine shouldn't roll back the
  // score that was just recorded.
  try {
    await onMatchCompleted(tournamentId);
  } catch (err) {
    console.error("tournament-queue: onMatchCompleted failed", err);
  }

  return NextResponse.json(match);
}
