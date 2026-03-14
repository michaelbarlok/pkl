import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import {
  generateSingleElimination,
  generateDoubleElimination,
  generateRoundRobin,
} from "@/lib/tournament-bracket";

async function getAuthorizedProfile(tournamentId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("user_id", user.id)
    .single();
  if (!profile) return null;

  const { data: tournament } = await supabase
    .from("tournaments")
    .select("created_by")
    .eq("id", tournamentId)
    .single();
  if (!tournament) return null;

  if (tournament.created_by !== profile.id && profile.role !== "admin") return null;

  return { profile, supabase };
}

/**
 * PUT: Merge or cancel divisions
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: tournamentId } = await params;
  const auth = await getAuthorizedProfile(tournamentId);
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
  const auth = await getAuthorizedProfile(tournamentId);
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

    // Generate bracket
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
