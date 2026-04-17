import { NextRequest, NextResponse } from "next/server";
import { getTournamentManager } from "@/lib/tournament-auth";

/**
 * GET: Return registrations for a division ordered by current seed (then registration date).
 * Used to populate the seeding UI in DivisionReview.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: tournamentId } = await params;
  const auth = await getTournamentManager(tournamentId);
  if (!auth) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  const { supabase } = auth;

  const division = request.nextUrl.searchParams.get("division");
  if (!division) {
    return NextResponse.json({ error: "division required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("tournament_registrations")
    .select("id, player_id, seed, registered_at, player:profiles!player_id(display_name)")
    .eq("tournament_id", tournamentId)
    .eq("division", division)
    .eq("status", "confirmed")
    .order("seed", { ascending: true, nullsFirst: false })
    .order("registered_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(
    (data ?? []).map((r) => ({
      id: r.id,
      player_id: r.player_id,
      display_name: (r.player as any)?.display_name ?? "Unknown",
      seed: r.seed,
    }))
  );
}

/**
 * PUT: Save seed order for a division.
 * Body: { division: string; order: string[] }
 * `order` is an array of player_ids — index 0 = seed 1, index 1 = seed 2, etc.
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
  const { division, order } = body as { division: string; order: string[] };

  if (!division || !Array.isArray(order)) {
    return NextResponse.json({ error: "division and order required" }, { status: 400 });
  }

  await Promise.all(
    order.map((playerId, index) =>
      supabase
        .from("tournament_registrations")
        .update({ seed: index + 1 })
        .eq("tournament_id", tournamentId)
        .eq("division", division)
        .eq("player_id", playerId)
        .eq("status", "confirmed")
    )
  );

  return NextResponse.json({ ok: true });
}

/**
 * DELETE: Clear all seeds for a division (revert to random assignment).
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: tournamentId } = await params;
  const auth = await getTournamentManager(tournamentId);
  if (!auth) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  const { supabase } = auth;

  const division = request.nextUrl.searchParams.get("division");
  if (!division) {
    return NextResponse.json({ error: "division required" }, { status: 400 });
  }

  await supabase
    .from("tournament_registrations")
    .update({ seed: null })
    .eq("tournament_id", tournamentId)
    .eq("division", division)
    .eq("status", "confirmed");

  return NextResponse.json({ ok: true });
}
