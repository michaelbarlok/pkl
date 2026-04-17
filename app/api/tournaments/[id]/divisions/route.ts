import { NextRequest, NextResponse } from "next/server";
import {
  generateSingleElimination,
  generateDoubleElimination,
  generateRoundRobin,
  generatePlayoffBracket,
  computePoolStandings,
  getPoolBrackets,
} from "@/lib/tournament-bracket";
import { getTournamentManager } from "@/lib/tournament-auth";

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
    const isMultiPool = poolBrackets.length >= 3;

    // Use organizer-provided seeding if given, otherwise compute from standings
    let seededPlayerIds: string[];

    if (seeded_players && seeded_players.length >= 2) {
      seededPlayerIds = seeded_players;
    } else if (isMultiPool) {
      // 3+ pools (13+ teams): top 2 from each pool, ranked across all pools
      const allQualifiers: { id: string; wins: number; losses: number; pointDiff: number }[] = [];
      for (const bracket of poolBrackets) {
        const bracketMatches = poolMatches.filter((m) => m.bracket === bracket);
        const standings = computePoolStandings(bracketMatches);
        allQualifiers.push(...standings.slice(0, 2));
      }
      allQualifiers.sort((a, b) => b.wins - a.wins || b.pointDiff - a.pointDiff);
      seededPlayerIds = allQualifiers.map((s) => s.id);
    } else if (poolBrackets.length === 2) {
      // 2 pools (7-12 teams): top 3 from each (slice naturally caps if a pool has fewer)
      const poolAMatches = poolMatches.filter((m) => m.bracket === poolBrackets[0]);
      const poolBMatches = poolMatches.filter((m) => m.bracket === poolBrackets[1]);

      const poolAStandings = computePoolStandings(poolAMatches);
      const poolBStandings = computePoolStandings(poolBMatches);

      const poolATop3 = poolAStandings.slice(0, 3);
      const poolBTop3 = poolBStandings.slice(0, 3);

      const allQualifiers = [...poolATop3, ...poolBTop3].sort(
        (a, b) => b.wins - a.wins || b.pointDiff - a.pointDiff
      );

      seededPlayerIds = allQualifiers.map((s) => s.id);
    } else {
      // Single pool: top 4
      const standings = computePoolStandings(poolMatches);
      seededPlayerIds = standings.slice(0, Math.min(4, standings.length)).map((s) => s.id);
    }

    if (seededPlayerIds.length < 2) {
      return NextResponse.json(
        { error: "Not enough teams to form playoff bracket" },
        { status: 400 }
      );
    }

    // Generate playoff bracket
    const playoffMatches = generatePlayoffBracket(seededPlayerIds);

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
      score1: [] as number[],
      score2: [] as number[],
    }));

    const { error: insertError } = await supabase
      .from("tournament_matches")
      .insert(matchInserts);

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
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
    .select("format, status, divisions")
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

  // Parse division_settings from request body
  const body = await request.json().catch(() => ({}));
  const divisionSettings: Record<string, { games_per_team?: number }> = body.division_settings ?? {};

  // Save division_settings to tournament
  if (Object.keys(divisionSettings).length > 0) {
    await supabase
      .from("tournaments")
      .update({ division_settings: divisionSettings })
      .eq("id", tournamentId);
  }

  // Delete existing matches
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
    const { games_per_team: gamesPerTeam } = divisionSettings[division] ?? {};

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
        bracketMatches = generateRoundRobin(playerIds, { gamesPerTeam, seeded: hasSeeds });
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

    // Auto-advance byes
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

    totalMatches += matchInserts.length;
  }

  // Advance tournament status
  await supabase
    .from("tournaments")
    .update({ status: "in_progress" })
    .eq("id", tournamentId);

  return NextResponse.json({ ok: true, matches: totalMatches });
}
