import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import {
  generateSingleElimination,
  generateDoubleElimination,
  generateRoundRobin,
} from "@/lib/tournament-bracket";
import { getTournamentManager } from "@/lib/tournament-auth";
import { validateScore } from "@/lib/score-validation";
import {
  runAssignmentPass,
  sendAssignmentPassNotifications,
} from "@/lib/tournament-queue";

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

  // Legacy single-bracket generator: ignores `division` and treats
  // every confirmed registration as one big roster. That's correct
  // for tournaments without divisions configured but produces
  // garbage for any tournament with multiple skill / gender / age
  // brackets — a Mixed 4.0 team would land in the same pool as a
  // Men's 3.0 team. The dedicated /divisions endpoint is the right
  // path for those; refuse here so a stale client or direct API
  // call can't blow away the per-division bracket.
  const tournamentDivisions = (tournament.divisions ?? []) as string[];
  if (tournamentDivisions.length > 0) {
    return NextResponse.json(
      {
        error:
          "This tournament has divisions configured — use the per-division Generate flow instead. The legacy bracket endpoint can't generate division-aware brackets.",
      },
      { status: 400 }
    );
  }

  // Doubles tournaments: refuse if any confirmed registration is
  // partnerless. Same guard the /divisions endpoint enforces — a
  // half-team in pool play would silently produce matches with one
  // slot null and corrupt the schedule. Belt-and-suspenders so
  // direct API hits can't bypass the close-registration nudge.
  if (tournament.type === "doubles") {
    const { count: partnerlessCount } = await supabase
      .from("tournament_registrations")
      .select("id", { count: "exact", head: true })
      .eq("tournament_id", tournamentId)
      .eq("status", "confirmed")
      .is("partner_id", null);
    if ((partnerlessCount ?? 0) > 0) {
      return NextResponse.json(
        {
          error: `${partnerlessCount} team${
            (partnerlessCount ?? 0) === 1 ? " is" : "s are"
          } still without a partner. Withdraw or fix them before generating brackets.`,
        },
        { status: 409 }
      );
    }
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
    .select("format, status, finals_best_of_3, win_by_2, score_to_win_pool, score_to_win_playoff, division_settings")
    .eq("id", tournamentId)
    .single();

  if (!tournament) {
    return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
  }

  // Cancelled tournaments are frozen — no more scoring. The Danger
  // Zone button sets this status and we treat it as terminal.
  if (tournament.status === "cancelled") {
    return NextResponse.json(
      { error: "This tournament has been cancelled — scores can't be recorded." },
      { status: 409 }
    );
  }

  // Completed tournaments are also frozen. Auto-completion no longer
  // happens server-side — the organizer has to explicitly press
  // "End Tournament" — so reaching this state means they've locked
  // results on purpose.
  if (tournament.status === "completed") {
    return NextResponse.json(
      { error: "This tournament has been ended — scores can't be edited." },
      { status: 409 }
    );
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

  // Per-game score validation. The winning team in each game must
  // reach the division's "score to win" target, and (if the
  // organizer enabled the rule) win by at least 2. Pool play uses
  // score_to_win_pool, playoff/championship games use _playoff.
  // Per-division overrides in division_settings take precedence over
  // the tournament-level default. The check is skipped if neither a
  // division override nor a tournament default is set, so older
  // tournaments without scoring config keep their previous behavior.
  const divisionOverrides =
    (tournament.division_settings as Record<string, { score_to_win_pool?: number; score_to_win_playoff?: number } | null> | null)?.[
      existingMatch.division ?? ""
    ] ?? null;
  const isPlayoffMatch = existingMatch.bracket === "playoff" || existingMatch.bracket === "grand_final";
  const targetScore = isPlayoffMatch
    ? divisionOverrides?.score_to_win_playoff ?? tournament.score_to_win_playoff
    : divisionOverrides?.score_to_win_pool ?? tournament.score_to_win_pool;
  const winBy2 = (tournament as any).win_by_2 === true;

  // Run each game through the shared validator so tournaments and
  // ladder sessions enforce the same rules — exact ending score
  // (e.g. 11-X for a 11-point game), win-by-2 caps, no ties. Without
  // this, 19-6 in a "first to 11" game slipped through because the
  // old inline check only verified "winner reached the limit" and
  // didn't bound the winner's score from above.
  if (typeof targetScore === "number" && targetScore > 0) {
    for (let i = 0; i < s1.length; i++) {
      const v = validateScore({
        scoreA: s1[i],
        scoreB: s2[i],
        gameLimit: targetScore,
        winBy2,
      });
      if (!v.ok) {
        return NextResponse.json(
          { error: `Game ${i + 1}: ${v.error}` },
          { status: 400 }
        );
      }
    }
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

  // Auto-advance winner to next match in bracket (scoped to same division).
  // Only fires for single-elim winner / double-elim grand_final brackets —
  // round_robin reuses the "winners" bracket label for its single-pool
  // schedule, where matches don't feed into a downstream tree, so this
  // advancement would silently overwrite later-round pool play slots and
  // schedule the same team twice. Pool play uses a flat circle-method
  // schedule — there's nothing to advance into.
  const isRoundRobin = tournament.format === "round_robin";
  if (
    !isRoundRobin &&
    (match.bracket === "winners" || match.bracket === "grand_final")
  ) {
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
      .select("round, match_number, id, series_game, status, winner_id, player1_id, player2_id")
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

      // Legacy / pre-feature data: tournament has finals_best_of_3
      // enabled but the championship row was generated before
      // series_game existed, so it's NULL. Treat the just-scored
      // championship as Game 1 of the series — backfill series_game
      // = 1 on the row so subsequent reads see it correctly, and
      // fall through to the spawn-next-game block below.
      if (
        tournament.finals_best_of_3 === true &&
        match.match_number === 1 &&
        match.round === maxRound &&
        match.series_game == null
      ) {
        const otherGames = allPlayoff.filter(
          (p: any) =>
            p.round === match.round &&
            p.match_number === 1 &&
            p.id !== match.id
        );
        // Only retro-mark when the championship is a single row.
        // If multiple rows already exist there's a series in flight.
        if (otherGames.length === 0) {
          await supabase
            .from("tournament_matches")
            .update({ series_game: 1 })
            .eq("id", match.id);
          match.series_game = 1;
          // Reflect the marker on the cached row too so the
          // seriesGames filter below picks it up.
          const cached = allPlayoff.find((p: any) => p.id === match.id);
          if (cached) cached.series_game = 1;
        }
      }

      // Best-of-3 series game just scored: spawn the next game if
      // the series isn't decided yet. Game 1 always begets Game 2.
      // Game 2 only begets Game 3 if the series is tied 1-1. Game 3
      // is always terminal.
      if (match.series_game != null) {
        const seriesGames = allPlayoff.filter(
          (p: any) =>
            p.round === match.round &&
            p.match_number === match.match_number &&
            p.series_game != null
        );
        // Roll up game wins per team, treating the just-saved match's
        // winner as part of the tally (the row's status flipped to
        // completed earlier; allPlayoff fetched its updated state).
        const wins = new Map<string, number>();
        for (const g of seriesGames) {
          if (g.status === "completed" && g.winner_id) {
            wins.set(g.winner_id, (wins.get(g.winner_id) ?? 0) + 1);
          }
        }
        const decided = Array.from(wins.values()).some((w) => w >= 2);
        const nextGameNumber = (match.series_game as number) + 1;
        const alreadySpawned = seriesGames.some(
          (g: any) => g.series_game === nextGameNumber
        );
        // Game 2 always spawns after Game 1 (1 win can't decide).
        // Game 3 only when tied 1-1. Game 3 never spawns Game 4.
        if (!decided && nextGameNumber <= 3 && !alreadySpawned) {
          await supabase.from("tournament_matches").insert({
            tournament_id: tournamentId,
            division: match.division ?? null,
            round: match.round,
            match_number: match.match_number,
            bracket: "playoff",
            player1_id: match.player1_id,
            player2_id: match.player2_id,
            status: "pending",
            series_game: nextGameNumber,
            score1: [],
            score2: [],
          });
        }

        // If editing a series game flips the result so the series is
        // now decided (one team has 2 wins), any later game rows in
        // the series are orphaned — e.g. Game 2 was 11-9 for B
        // (1-1, Game 3 spawned), now corrected to 9-11 for A so A
        // sweeps 2-0 and Game 3 should never be played. Delete every
        // pending future game row in the series so the bracket
        // collapses and the championship is awarded.
        if (decided) {
          const orphanIds = seriesGames
            .filter(
              (g: any) =>
                typeof g.series_game === "number" &&
                g.series_game > (match.series_game as number) &&
                g.status !== "completed"
            )
            .map((g: any) => g.id);
          if (orphanIds.length > 0) {
            await supabase
              .from("tournament_matches")
              .delete()
              .in("id", orphanIds);
          }
        }
      }

      // Determine loser
      const loserId = match.player1_id === winner_id ? match.player2_id : match.player1_id;

      if (!isFinalRound) {
        // Winner advancement
        if (isSemifinalRound) {
          // SF winners → final (match 1 in max round). For best-of-3
          // we always target Game 1 (the only series row that exists
          // at SF time; Games 2/3 spawn later).
          const winnerSlot = match.match_number % 2 === 1 ? "player1_id" : "player2_id";
          const finalMatch = allPlayoff.find(
            (m: any) =>
              m.round === maxRound &&
              m.match_number === 1 &&
              (m.series_game == null || m.series_game === 1)
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
          // Earlier rounds (anything before SF): playoff re-seeding.
          // Wait until every match in the current round is decided,
          // then pair the remaining teams highest-seed vs lowest-
          // seed and write those pairings into the next round. This
          // way #1 always plays the lowest remaining team each
          // round; the SF→Final hop is handled by the existing
          // branch above.
          //
          // We include the just-saved match's outcome in the cached
          // allPlayoff snapshot manually since the SELECT above ran
          // BEFORE the score update was committed.
          const cachedSelf = allPlayoff.find((p: any) => p.id === match.id);
          if (cachedSelf) {
            cachedSelf.status = "completed";
            cachedSelf.winner_id = winner_id;
          }

          const currentRoundMatches = allPlayoff.filter(
            (m: any) => m.round === match.round
          );
          const allRoundDone = currentRoundMatches.every(
            (m: any) => m.status === "completed" || m.status === "bye"
          );

          if (allRoundDone) {
            // Winners + bye-advancers from this round.
            const advancers: string[] = [];
            for (const m of currentRoundMatches) {
              if (m.status === "completed" && m.winner_id) {
                advancers.push(m.winner_id);
              } else if (m.status === "bye") {
                const pid = (m.player1_id ?? m.player2_id) as string | null;
                if (pid) advancers.push(pid);
              }
            }

            // Carry-overs: teams already sitting in the next round
            // because they bypassed this round entirely (e.g. seeds
            // 1 and 2 in a 6-team bracket are pre-seeded directly
            // into the SF row rather than playing R1). We dedupe
            // against advancers since per-match advancement has
            // been removed for non-SF rounds — anything in next-
            // round slots that isn't a fresh winner is a true
            // carry-over.
            const nextRoundMatches = allPlayoff.filter(
              (m: any) => m.round === match.round + 1
            );
            const advancerSet = new Set(advancers);
            const carryOvers: string[] = [];
            for (const m of nextRoundMatches) {
              if (m.player1_id && !advancerSet.has(m.player1_id)) {
                carryOvers.push(m.player1_id);
              }
              if (m.player2_id && !advancerSet.has(m.player2_id)) {
                carryOvers.push(m.player2_id);
              }
            }

            const remaining = Array.from(new Set([...advancers, ...carryOvers]));

            // Look up seeds (persisted on tournament_registrations
            // by the advance_to_playoffs flow). Lower seed number =
            // higher rank.
            let seedQuery = supabase
              .from("tournament_registrations")
              .select("player_id, seed")
              .eq("tournament_id", tournamentId)
              .in("player_id", remaining);
            if (match.division) {
              seedQuery = seedQuery.eq("division", match.division);
            }
            const { data: seedRows } = await seedQuery;
            const seedByPlayer = new Map<string, number>(
              ((seedRows ?? []) as { player_id: string; seed: number | null }[])
                .map((r) => [r.player_id, r.seed ?? 999])
            );

            // Sort highest seed (lowest number) first.
            remaining.sort(
              (a, b) => (seedByPlayer.get(a) ?? 999) - (seedByPlayer.get(b) ?? 999)
            );

            // Pair highest vs lowest, second-highest vs second-lowest,
            // etc. Slot into next-round matches in match_number order.
            const sortedNextRound = [...nextRoundMatches].sort(
              (a: any, b: any) => a.match_number - b.match_number
            );
            const pairCount = Math.floor(remaining.length / 2);
            for (let i = 0; i < pairCount; i++) {
              const target = sortedNextRound[i];
              if (!target) continue;
              const high = remaining[i];
              const low = remaining[remaining.length - 1 - i];
              await supabase
                .from("tournament_matches")
                .update({ player1_id: high, player2_id: low })
                .eq("id", target.id);
            }
          }
          // If not all R matches are done yet, do nothing — the
          // next score in this round will fire this branch and
          // eventually trigger the re-seed when allRoundDone flips.
        }
      }
    }
  }

  // If editing a completed match and the winner changed, fix downstream slots
  // Replace old winner/loser references in later rounds with new winner/loser.
  // Skipped for round_robin pool play (same "winners" label reuse problem
  // as above — round-robin matches have no downstream tree to repair).
  if (
    winnerChanged &&
    !isRoundRobin &&
    (match.bracket === "winners" || match.bracket === "playoff" || match.bracket === "grand_final")
  ) {
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

  // Tournament status is no longer flipped to "completed" here.
  // Final results are only locked when the organizer explicitly hits
  // "End Tournament" (POST /api/tournaments/[id]/complete) — that
  // gate keeps every match editable for as long as the bracket is
  // still in_progress, including championship games that have already
  // been entered. Auto-completing here would hide the End Tournament
  // button and reject any subsequent score correction with a 409.

  // Two-phase post-score work:
  //
  //   1. ASSIGNMENT (awaited): walk the queue, stamp queue_entered_at
  //      on newly-eligible matches, and assign the next queued match
  //      to whichever court just freed up. Pure DB writes — fast.
  //      Awaited so the response includes the freshly-filled court,
  //      and the client's router.refresh() reads the new state in
  //      the same round trip. (Realtime is unreliable for closing
  //      this gap on its own — the user saw a stale view earlier.)
  //
  //   2. NOTIFICATIONS (waitUntil): "Head to Court N" pushes for the
  //      newly-assigned team and "Up next / 3rd in line" pushes for
  //      the next two queue rows. Heavy — push delivery can hang up
  //      to 10s on a stale subscription and Resend takes 1-3s per
  //      email. Detached from the request lifecycle via waitUntil so
  //      Vercel keeps the function alive without blocking the
  //      response. A bare `void` would get killed when the function
  //      instance freezes post-response.
  let passResult: Awaited<ReturnType<typeof runAssignmentPass>> = null;
  try {
    passResult = await runAssignmentPass(tournamentId, {
      skipNotifications: true,
    });
  } catch (err) {
    console.error("tournament-queue: runAssignmentPass failed", err);
  }

  if (passResult) {
    waitUntil(
      sendAssignmentPassNotifications(tournamentId, passResult).catch((err) => {
        console.error(
          "tournament-queue: sendAssignmentPassNotifications failed",
          err,
        );
      })
    );
  }

  return NextResponse.json(match);
}
