import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import {
  generateSingleElimination,
  generateDoubleElimination,
  generateRoundRobin,
} from "@/lib/tournament-bracket";

/**
 * POST: Generate bracket and advance tournament to in_progress.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: tournamentId } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("user_id", user.id)
    .single();

  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  // Fetch tournament
  const { data: tournament } = await supabase
    .from("tournaments")
    .select("*")
    .eq("id", tournamentId)
    .single();

  if (!tournament) {
    return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
  }

  // Only creator or admin
  if (tournament.created_by !== profile.id && profile.role !== "admin") {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
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
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("user_id", user.id)
    .single();

  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const body = await request.json();
  const { match_id, score1, score2, winner_id } = body;

  // Validate
  if (!match_id || !winner_id) {
    return NextResponse.json({ error: "match_id and winner_id required" }, { status: 400 });
  }

  // Fetch tournament to verify authorization
  const { data: tournament } = await supabase
    .from("tournaments")
    .select("created_by, format")
    .eq("id", tournamentId)
    .single();

  if (!tournament) {
    return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
  }

  if (tournament.created_by !== profile.id && profile.role !== "admin") {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  // Update match score
  const { data: match, error: updateError } = await supabase
    .from("tournament_matches")
    .update({
      score1: score1 ?? [],
      score2: score2 ?? [],
      winner_id,
      status: "completed",
    })
    .eq("id", match_id)
    .select()
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Auto-advance winner to next match in bracket
  if (match.bracket === "winners" || match.bracket === "grand_final") {
    // Find the next match slot
    const nextRound = match.round + 1;
    const nextMatchNumber = Math.ceil(match.match_number / 2);
    const slot = match.match_number % 2 === 1 ? "player1_id" : "player2_id";

    // Check if there's a next round match in the same bracket
    const { data: nextMatch } = await supabase
      .from("tournament_matches")
      .select("id")
      .eq("tournament_id", tournamentId)
      .eq("round", nextRound)
      .eq("match_number", nextMatchNumber)
      .eq("bracket", match.bracket)
      .single();

    if (nextMatch) {
      await supabase
        .from("tournament_matches")
        .update({ [slot]: winner_id })
        .eq("id", nextMatch.id);
    }
  }

  // Check if tournament is complete (all matches in final round completed)
  const { data: pendingMatches } = await supabase
    .from("tournament_matches")
    .select("id")
    .eq("tournament_id", tournamentId)
    .in("status", ["pending", "in_progress"])
    .limit(1);

  if (!pendingMatches || pendingMatches.length === 0) {
    await supabase
      .from("tournaments")
      .update({ status: "completed" })
      .eq("id", tournamentId);
  }

  return NextResponse.json(match);
}
