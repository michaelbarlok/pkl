import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

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
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const body = await request.json();
  const { partner_id, division } = body;

  // Fetch tournament
  const { data: tournament } = await supabase
    .from("tournaments")
    .select("*")
    .eq("id", tournamentId)
    .single();

  if (!tournament) {
    return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
  }

  if (tournament.status !== "registration_open") {
    return NextResponse.json({ error: "Registration is not open" }, { status: 400 });
  }

  // Check if player already registered (as player or partner)
  const { data: existing } = await supabase
    .from("tournament_registrations")
    .select("id")
    .eq("tournament_id", tournamentId)
    .or(`player_id.eq.${profile.id},partner_id.eq.${profile.id}`)
    .neq("status", "withdrawn")
    .limit(1);

  if (existing && existing.length > 0) {
    return NextResponse.json({ error: "You are already registered for this tournament" }, { status: 409 });
  }

  // If doubles, check partner isn't already registered
  if (partner_id) {
    const { data: partnerExisting } = await supabase
      .from("tournament_registrations")
      .select("id")
      .eq("tournament_id", tournamentId)
      .or(`player_id.eq.${partner_id},partner_id.eq.${partner_id}`)
      .neq("status", "withdrawn")
      .limit(1);

    if (partnerExisting && partnerExisting.length > 0) {
      return NextResponse.json({ error: "Your partner is already registered" }, { status: 409 });
    }
  }

  // Count confirmed registrations
  const { count: confirmedCount } = await supabase
    .from("tournament_registrations")
    .select("*", { count: "exact", head: true })
    .eq("tournament_id", tournamentId)
    .eq("status", "confirmed");

  const isFull = tournament.player_cap && (confirmedCount ?? 0) >= tournament.player_cap;
  const status = isFull ? "waitlist" : "confirmed";

  // Compute waitlist position if needed
  let waitlistPosition = null;
  if (status === "waitlist") {
    const { count: waitlistCount } = await supabase
      .from("tournament_registrations")
      .select("*", { count: "exact", head: true })
      .eq("tournament_id", tournamentId)
      .eq("status", "waitlist");
    waitlistPosition = (waitlistCount ?? 0) + 1;
  }

  const { data: registration, error } = await supabase
    .from("tournament_registrations")
    .insert({
      tournament_id: tournamentId,
      player_id: profile.id,
      partner_id: partner_id || null,
      division: division || null,
      status,
      waitlist_position: waitlistPosition,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(registration);
}

/**
 * DELETE: Withdraw from tournament
 */
export async function DELETE(
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
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  // Find registration
  const { data: reg } = await supabase
    .from("tournament_registrations")
    .select("id, status")
    .eq("tournament_id", tournamentId)
    .or(`player_id.eq.${profile.id},partner_id.eq.${profile.id}`)
    .neq("status", "withdrawn")
    .single();

  if (!reg) {
    return NextResponse.json({ error: "Registration not found" }, { status: 404 });
  }

  const wasConfirmed = reg.status === "confirmed";

  // Withdraw
  await supabase
    .from("tournament_registrations")
    .update({ status: "withdrawn" })
    .eq("id", reg.id);

  // If was confirmed and there's a waitlist, promote the first person
  if (wasConfirmed) {
    const { data: nextWaitlist } = await supabase
      .from("tournament_registrations")
      .select("id")
      .eq("tournament_id", tournamentId)
      .eq("status", "waitlist")
      .order("waitlist_position", { ascending: true })
      .limit(1)
      .single();

    if (nextWaitlist) {
      await supabase
        .from("tournament_registrations")
        .update({ status: "confirmed", waitlist_position: null })
        .eq("id", nextWaitlist.id);
    }
  }

  return NextResponse.json({ status: "withdrawn" });
}
