import { NextRequest, NextResponse } from "next/server";
import {
  generateSingleElimination,
  generateDoubleElimination,
  generateRoundRobin,
  generatePlayoffBracket,
  computePoolStandings,
  computeCrossPoolSeeding,
  getPoolBrackets,
  getPoolStructure,
} from "@/lib/tournament-bracket";
import { getDivision, getDivisionLabel, SKILLS } from "@/lib/divisions";
import { getTournamentManager } from "@/lib/tournament-auth";
import { notifyMany } from "@/lib/notify";
import { activateDivisionQueue } from "@/lib/tournament-queue";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * PUT: Merge or cancel divisions
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
  const { supabase } = auth;

  const body = await request.json();

  if (body.action === "merge") {
    const { target, sources } = body as { target: string; sources: string[] };
    if (!target || !sources || sources.length === 0) {
      return NextResponse.json({ error: "target and sources required" }, { status: 400 });
    }

    const allDivisions = [target, ...sources];

    // Fetch registration IDs per division before moving, so we can seed by source division
    const divisionRegs: Record<string, { id: string }[]> = {};
    await Promise.all(
      allDivisions.map(async (div) => {
        const { data } = await supabase
          .from("tournament_registrations")
          .select("id")
          .eq("tournament_id", tournamentId)
          .eq("division", div)
          .neq("status", "withdrawn");
        divisionRegs[div] = data ?? [];
      })
    );

    // Move all registrations from source divisions into target division
    for (const source of sources) {
      await supabase
        .from("tournament_registrations")
        .update({ division: target })
        .eq("tournament_id", tournamentId)
        .eq("division", source)
        .neq("status", "withdrawn");
    }

    // Remove source divisions from the tournament's divisions array
    const { data: tournament } = await supabase
      .from("tournaments")
      .select("divisions")
      .eq("id", tournamentId)
      .single();

    if (tournament) {
      const updatedDivisions = (tournament.divisions as string[]).filter(
        (d) => !sources.includes(d)
      );
      await supabase
        .from("tournaments")
        .update({ divisions: updatedDivisions })
        .eq("id", tournamentId);
    }

    // Auto-seed by skill level (highest first), random within each tier.
    // SKILLS is ordered 3.0 → 3.5 → 4.0 → 4.5+ so higher index = higher skill.
    const skillRank = (divCode: string): number =>
      SKILLS.findIndex((s) => s.value === getDivision(divCode)?.skill);

    const sortedDivisions = allDivisions
      .filter((div) => divisionRegs[div]?.length > 0)
      .sort((a, b) => skillRank(b) - skillRank(a)); // highest skill → seed 1

    // Build ordered list: shuffle within each tier then concatenate
    const seededIds: string[] = [];
    for (const div of sortedDivisions) {
      const ids = divisionRegs[div].map((r) => r.id);
      // Fisher-Yates shuffle within tier
      for (let i = ids.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [ids[i], ids[j]] = [ids[j], ids[i]];
      }
      seededIds.push(...ids);
    }

    await Promise.all(
      seededIds.map((id, i) =>
        supabase
          .from("tournament_registrations")
          .update({ seed: i + 1 })
          .eq("id", id)
      )
    );

    return NextResponse.json({ ok: true });
  }

  if (body.action === "cancel") {
    const { division } = body as { division: string };
    if (!division) {
      return NextResponse.json({ error: "division required" }, { status: 400 });
    }

    // Withdraw all registrations in this division
    await supabase
      .from("tournament_registrations")
      .update({ status: "withdrawn" })
      .eq("tournament_id", tournamentId)
      .eq("division", division)
      .neq("status", "withdrawn");

    // Remove division from tournament
    const { data: tournament } = await supabase
      .from("tournaments")
      .select("divisions")
      .eq("id", tournamentId)
      .single();

    if (tournament) {
      const updatedDivisions = (tournament.divisions as string[]).filter(
        (d) => d !== division
      );
      await supabase
        .from("tournaments")
        .update({ divisions: updatedDivisions })
        .eq("id", tournamentId);
    }

    return NextResponse.json({ ok: true });
  }

  if (body.action === "advance_to_playoffs") {
    const { division, seeded_players } = body as { division: string; seeded_players?: string[] };
    if (!division) {
      return NextResponse.json({ error: "division required" }, { status: 400 });
    }

    // Fetch all pool play matches for this division
    const { data: poolMatches } = await supabase
      .from("tournament_matches")
      .select("player1_id, player2_id, winner_id, score1, score2, status, bracket")
      .eq("tournament_id", tournamentId)
      .eq("division", division)
      .neq("bracket", "playoff");

    if (!poolMatches) {
      return NextResponse.json({ error: "No pool matches found" }, { status: 400 });
    }

    // Check all non-bye pool matches are completed
    const incomplete = poolMatches.filter(
      (m) => m.status !== "completed" && m.status !== "bye"
    );
    if (incomplete.length > 0) {
      return NextResponse.json(
        { error: `${incomplete.length} pool match(es) still pending` },
        { status: 400 }
      );
    }

    // Detect pool structure from bracket labels.
    // With max 6 teams per pool: 3-6 teams → 1 pool, 7-12 → 2 pools, 13+ → 3+ pools.
    const poolBrackets = getPoolBrackets(poolMatches);
    const numPools = poolBrackets.length;

    // Organizer-configured override for total advancing teams. When
    // set, we split it across the pools (top K each, with leftover
    // spots going to the largest "best remaining" sweep).
    const { data: tournamentForSettings } = await supabase
      .from("tournaments")
      .select("division_settings, finals_best_of_3")
      .eq("id", tournamentId)
      .single();
    const overrideAdvancing = (tournamentForSettings as any)?.division_settings?.[division]?.playoff_advancing as
      | number
      | undefined;
    const finalsBestOf3 = (tournamentForSettings as any)?.finals_best_of_3 === true;

    // Defaults if the organizer didn't pick: 4 / 6 / 2-per-pool.
    const defaultAdvancing =
      numPools === 1 ? 4 : numPools === 2 ? 6 : numPools * 2;
    const totalAdvancing = overrideAdvancing && overrideAdvancing >= 2
      ? overrideAdvancing
      : defaultAdvancing;

    // Use organizer-provided seeding if given, otherwise compute from standings
    let seededPlayerIds: string[];

    if (seeded_players && seeded_players.length >= 2) {
      seededPlayerIds = seeded_players;
    } else {
      const perPoolBase = Math.floor(totalAdvancing / Math.max(1, numPools));
      const remainder = totalAdvancing % Math.max(1, numPools);

      // Pull per-pool standings (with H2H already applied within each
      // pool) and feed them to computeCrossPoolSeeding, which handles
      // the cross-pool merge: wins → PD → H2H (only same-pool) →
      // stable hash for cross-pool ties. Mirrors what the Review
      // Advancement UI proposes so an organizer who skipped the panel
      // still gets the same order the UI would have shown them.
      const perPool = poolBrackets.map((bracket, idx) => {
        const bracketMatches = poolMatches.filter((m) => m.bracket === bracket);
        return {
          bracket,
          standings: computePoolStandings(bracketMatches),
          takeCount: perPoolBase + (idx < remainder ? 1 : 0),
        };
      });
      const seeded = computeCrossPoolSeeding(perPool);
      seededPlayerIds = seeded.map((s) => s.id);
    }

    if (seededPlayerIds.length < 2) {
      return NextResponse.json(
        { error: "Not enough teams to form playoff bracket" },
        { status: 400 }
      );
    }

    // Generate playoff bracket. Best-of-3 finals only spawn Game 1
    // up front — Games 2 and 3 are inserted by the score-entry
    // endpoint as the series progresses.
    const playoffMatches = generatePlayoffBracket(seededPlayerIds, {
      finalsBestOf3,
    });

    // Insert playoff matches
    const matchInserts = playoffMatches.map((m) => ({
      tournament_id: tournamentId,
      division,
      round: m.round,
      match_number: m.match_number,
      bracket: m.bracket,
      player1_id: m.player1_id,
      player2_id: m.player2_id,
      status: m.status,
      series_game: m.series_game ?? null,
      score1: [] as number[],
      score2: [] as number[],
    }));

    const { error: insertError } = await supabase
      .from("tournament_matches")
      .insert(matchInserts);

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    // Persist playoff seed numbers on each advancing team's
    // registration row. Index 0 in seededPlayerIds is the #1 seed.
    // Stored so the playoff bracket UI can render "(1)" / "(2)" /…
    // beside team names without recomputing the seed order.
    for (let i = 0; i < seededPlayerIds.length; i++) {
      await supabase
        .from("tournament_registrations")
        .update({ seed: i + 1 })
        .eq("tournament_id", tournamentId)
        .eq("division", division)
        .eq("player_id", seededPlayerIds[i]);
    }

    // Auto-advance byes in the playoff bracket
    const byeMatches = playoffMatches.filter((m) => m.status === "bye");
    for (const bye of byeMatches) {
      const winnerId = bye.player1_id || bye.player2_id;
      if (winnerId) {
        await supabase
          .from("tournament_matches")
          .update({ winner_id: winnerId, status: "completed" })
          .eq("tournament_id", tournamentId)
          .eq("division", division)
          .eq("round", bye.round)
          .eq("match_number", bye.match_number)
          .eq("bracket", bye.bracket);
      }
    }

    // Kick the Court Tracker queue so freshly-inserted R1 playoff
    // matches get stamped queue_entered_at and start filling open
    // courts. Without this the Court Tracker was empty the moment
    // playoffs began — pool play ended, nothing queued.
    await activateDivisionQueue(tournamentId);

    // Notify everyone who played pool play in this division that
    // the playoff bracket is live. Source is tournament_registrations
    // (so partners get the push too) filtered to the division. Test
    // users are suppressed inside notify().
    const { data: tournamentInfo } = await supabase
      .from("tournaments")
      .select("title")
      .eq("id", tournamentId)
      .single();
    const service = await createServiceClient();
    const { data: divisionRegs } = await service
      .from("tournament_registrations")
      .select("player_id, partner_id")
      .eq("tournament_id", tournamentId)
      .eq("division", division)
      .neq("status", "withdrawn");
    const recipients = new Set<string>();
    for (const r of (divisionRegs ?? []) as any[]) {
      if (r.player_id) recipients.add(r.player_id);
      if (r.partner_id) recipients.add(r.partner_id);
    }
    if (recipients.size > 0) {
      const divLabel = getDivisionLabel(division);
      const title = tournamentInfo?.title ?? "Your tournament";
      const playoffsTitle = `${divLabel} playoffs are starting`;
      const playoffsBody = `${title} — ${seededPlayerIds.length} team${seededPlayerIds.length === 1 ? "" : "s"} advanced. Head to the Play tab for your next match.`;
      await notifyMany(Array.from(recipients), {
        type: "tournament_playoffs_starting",
        title: playoffsTitle,
        body: playoffsBody,
        link: `/tournaments/${tournamentId}/live`,
        emailTemplate: "TournamentAlert",
        emailData: {
          tournamentTitle: title,
          alertTitle: playoffsTitle,
          alertBody: playoffsBody,
          link: `/tournaments/${tournamentId}/live`,
        },
      });
    }

    return NextResponse.json({ ok: true, playoff_teams: seededPlayerIds.length });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

/**
 * POST: Generate brackets for all divisions and start the tournament
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
  const { supabase } = auth;

  // Fetch tournament
  const { data: tournament } = await supabase
    .from("tournaments")
    .select("format, status, divisions, type")
    .eq("id", tournamentId)
    .single();

  if (!tournament) {
    return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
  }

  if (tournament.status !== "registration_closed") {
    return NextResponse.json(
      { error: "Tournament must be in registration_closed status" },
      { status: 400 }
    );
  }

  const divisions = tournament.divisions as string[];
  if (!divisions || divisions.length === 0) {
    return NextResponse.json({ error: "No divisions configured" }, { status: 400 });
  }

  // Doubles tournaments: refuse to generate if any confirmed
  // registration is missing a partner. Including a half-team in pool
  // play would silently bake "ghost" rows into the schedule —
  // matches with one slot null, opponents playing 1-vs-2, standings
  // skewed. The Close Registration flow already nudges the organizer
  // to fix or withdraw these teams, so by the time we get here there
  // shouldn't be any. This is the belt-and-suspenders guard so a
  // direct API call or a stale registration_closed snapshot can't
  // sneak partnerless teams into the bracket.
  if (tournament.type === "doubles") {
    const { data: partnerless } = await supabase
      .from("tournament_registrations")
      .select(
        "id, division, player:profiles!tournament_registrations_player_id_fkey(display_name)"
      )
      .eq("tournament_id", tournamentId)
      .eq("status", "confirmed")
      .is("partner_id", null);
    if (partnerless && partnerless.length > 0) {
      type Row = {
        id: string;
        division: string | null;
        player:
          | { display_name: string | null }
          | { display_name: string | null }[]
          | null;
      };
      return NextResponse.json(
        {
          error: `${partnerless.length} team${
            partnerless.length === 1 ? " is" : "s are"
          } still without a partner. Withdraw or fix them before generating brackets.`,
          partnerless_teams: (partnerless as Row[]).map((r) => {
            const p = Array.isArray(r.player) ? r.player[0] : r.player;
            return {
              id: r.id,
              division: r.division,
              playerName: p?.display_name ?? "Unknown",
            };
          }),
        },
        { status: 409 }
      );
    }
  }

  // Parse division_settings from request body
  const body = await request.json().catch(() => ({}));
  const divisionSettings: Record<
    string,
    {
      games_per_team?: number;
      num_pools?: number;
      playoff_advancing?: number;
      score_to_win_pool?: number;
      score_to_win_playoff?: number;
    }
  > = body.division_settings ?? {};

  // Save division_settings to tournament
  if (Object.keys(divisionSettings).length > 0) {
    await supabase
      .from("tournaments")
      .update({ division_settings: divisionSettings })
      .eq("id", tournamentId);
  }

  // Refuse regeneration if any pool / playoff match has been scored —
  // regenerating would silently wipe completed results. Organizers
  // who really want to redo brackets from scratch should delete the
  // tournament or withdraw all registrations first.
  const { count: completedCount } = await supabase
    .from("tournament_matches")
    .select("id", { count: "exact", head: true })
    .eq("tournament_id", tournamentId)
    .eq("status", "completed");
  if ((completedCount ?? 0) > 0) {
    return NextResponse.json(
      {
        error:
          `Can't regenerate brackets — ${completedCount} match${(completedCount ?? 0) === 1 ? " has" : "es have"} already been scored. Delete the tournament if you need to start over.`,
      },
      { status: 409 }
    );
  }

  // Delete existing (all pending) matches.
  await supabase
    .from("tournament_matches")
    .delete()
    .eq("tournament_id", tournamentId);

  let totalMatches = 0;

  // Generate bracket per division
  for (const division of divisions) {
    // Fetch confirmed registrations for this division
    const { data: registrations } = await supabase
      .from("tournament_registrations")
      .select("player_id, seed")
      .eq("tournament_id", tournamentId)
      .eq("division", division)
      .eq("status", "confirmed")
      .order("seed", { ascending: true, nullsFirst: false })
      .order("registered_at", { ascending: true });

    if (!registrations || registrations.length < 2) continue;

    const playerIds = registrations.map((r) => r.player_id);
    const hasSeeds = registrations.some((r) => r.seed != null);

    // Get pool settings for this division
    const { games_per_team: gamesPerTeam, num_pools: numPools } =
      divisionSettings[division] ?? {};

    // Validate gamesPerTeam bounds for round-robin formats. Lower
    // bound of 1 stops a "no matches at all" silent emit when
    // gamesPerTeam is 0 / negative (only relevant for even pools —
    // odd pools force-round-up to 1 lap regardless). Upper bound is
    // 2 × (poolSize − 1), i.e. at most a double round robin of the
    // largest pool — past that the schedule is just rematches piled
    // on rematches with no organizer benefit. Same getPoolStructure
    // used by the generator itself, so the cap matches what the UI
    // actually presents to organizers.
    if (
      tournament.format === "round_robin" &&
      gamesPerTeam !== undefined &&
      gamesPerTeam !== null
    ) {
      if (!Number.isInteger(gamesPerTeam) || gamesPerTeam < 1) {
        return NextResponse.json(
          {
            error: `Games per team for ${getDivisionLabel(
              division
            )} must be a whole number ≥ 1.`,
          },
          { status: 400 }
        );
      }
      const structure = getPoolStructure(playerIds.length, { numPools });
      if (gamesPerTeam > structure.maxGamesPerTeam) {
        return NextResponse.json(
          {
            error: `Games per team for ${getDivisionLabel(
              division
            )} can be at most ${structure.maxGamesPerTeam} (a double round robin of the largest pool).`,
          },
          { status: 400 }
        );
      }
    }

    // Generate bracket
    let bracketMatches;
    switch (tournament.format) {
      case "single_elimination":
        // playerIds are already sorted by seed (SQL order above)
        bracketMatches = generateSingleElimination(playerIds);
        break;
      case "double_elimination":
        bracketMatches = generateDoubleElimination(playerIds);
        break;
      case "round_robin":
        bracketMatches = generateRoundRobin(playerIds, {
          gamesPerTeam,
          seeded: hasSeeds,
          numPools,
        });
        break;
      default:
        continue;
    }

    // Insert matches with division
    const matchInserts = bracketMatches.map((m) => ({
      tournament_id: tournamentId,
      division,
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

    // Auto-advance byes — ONLY for elimination brackets. In
    // round-robin pool play a BYE means the team sits out the round;
    // converting it to a "completed" match with a winner would give
    // that team a free win in pool standings, which is wrong. Pool
    // BYE rows stay at status="bye" with winner_id=null so
    // computePoolStandings skips them entirely.
    if (tournament.format !== "round_robin") {
      const byeMatches = bracketMatches.filter((m) => m.status === "bye");
      for (const bye of byeMatches) {
        const winnerId = bye.player1_id || bye.player2_id;
        if (winnerId) {
          await supabase
            .from("tournament_matches")
            .update({ winner_id: winnerId, status: "completed" })
            .eq("tournament_id", tournamentId)
            .eq("division", division)
            .eq("round", bye.round)
            .eq("match_number", bye.match_number)
            .eq("bracket", bye.bracket);
        }
      }
    }

    totalMatches += matchInserts.length;
  }

  // Advance tournament status
  await supabase
    .from("tournaments")
    .update({ status: "in_progress" })
    .eq("id", tournamentId);

  return NextResponse.json({ ok: true, matches: totalMatches });
}
