import { requireAuth } from "@/lib/auth";
import { checkAndAwardBadges } from "@/lib/badges";
import { createServiceClient } from "@/lib/supabase/server";
import { notify } from "@/lib/notify";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: tournamentId } = await params;

  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const body = await request.json();
  const { partner_id, division } = body;

  // Fetch tournament
  const { data: tournament } = await auth.supabase
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
  const { data: existing } = await auth.supabase
    .from("tournament_registrations")
    .select("id")
    .eq("tournament_id", tournamentId)
    .or(`player_id.eq.${auth.profile.id},partner_id.eq.${auth.profile.id}`)
    .neq("status", "withdrawn")
    .limit(1);

  if (existing && existing.length > 0) {
    return NextResponse.json({ error: "You are already registered for this tournament" }, { status: 409 });
  }

  // If doubles, check partner isn't already registered
  if (partner_id) {
    const { data: partnerExisting } = await auth.supabase
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

  // Determine if the division is full
  let isFull = false;

  // Check per-division cap
  if (tournament.max_teams_per_division && division) {
    const { count: divisionConfirmed } = await auth.supabase
      .from("tournament_registrations")
      .select("*", { count: "exact", head: true })
      .eq("tournament_id", tournamentId)
      .eq("division", division)
      .eq("status", "confirmed");

    if ((divisionConfirmed ?? 0) >= tournament.max_teams_per_division) {
      isFull = true;
    }
  }

  // Also check overall tournament cap
  if (!isFull && tournament.player_cap) {
    const { count: confirmedCount } = await auth.supabase
      .from("tournament_registrations")
      .select("*", { count: "exact", head: true })
      .eq("tournament_id", tournamentId)
      .eq("status", "confirmed");

    if ((confirmedCount ?? 0) >= tournament.player_cap) {
      isFull = true;
    }
  }

  const status = isFull ? "waitlist" : "confirmed";

  // Compute waitlist position (per-division if division exists)
  let waitlistPosition = null;
  if (status === "waitlist") {
    let query = auth.supabase
      .from("tournament_registrations")
      .select("*", { count: "exact", head: true })
      .eq("tournament_id", tournamentId)
      .eq("status", "waitlist");

    if (division) {
      query = query.eq("division", division);
    }

    const { count: waitlistCount } = await query;
    waitlistPosition = (waitlistCount ?? 0) + 1;
  }

  const { data: registration, error } = await auth.supabase
    .from("tournament_registrations")
    .insert({
      tournament_id: tournamentId,
      player_id: auth.profile.id,
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

  // Check tournament badges (non-blocking)
  checkAndAwardBadges(auth.profile.id, ["tournament"]).catch(() => {});

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

  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  // Find registration (include division for waitlist promotion)
  const { data: reg } = await auth.supabase
    .from("tournament_registrations")
    .select("id, status, division")
    .eq("tournament_id", tournamentId)
    .or(`player_id.eq.${auth.profile.id},partner_id.eq.${auth.profile.id}`)
    .neq("status", "withdrawn")
    .single();

  if (!reg) {
    return NextResponse.json({ error: "Registration not found" }, { status: 404 });
  }

  const wasConfirmed = reg.status === "confirmed";
  const division = reg.division;

  // Withdraw
  await auth.supabase
    .from("tournament_registrations")
    .update({ status: "withdrawn" })
    .eq("id", reg.id);

  // If was confirmed, promote the first waitlisted team from the same division
  if (wasConfirmed) {
    await promoteTournamentWaitlist(tournamentId, division);
  }

  return NextResponse.json({ status: "withdrawn" });
}

/**
 * Promote the first waitlisted registration for a tournament division.
 * Sends an email/notification to the promoted player.
 */
async function promoteTournamentWaitlist(
  tournamentId: string,
  division: string | null
): Promise<void> {
  const supabase = await createServiceClient();

  // Find next waitlisted registration in the same division
  let query = supabase
    .from("tournament_registrations")
    .select("id, player_id, partner_id")
    .eq("tournament_id", tournamentId)
    .eq("status", "waitlist")
    .order("waitlist_position", { ascending: true })
    .limit(1);

  if (division) {
    query = query.eq("division", division);
  }

  const { data: nextWaitlist } = await query.single();

  if (!nextWaitlist) return;

  // Promote to confirmed
  await supabase
    .from("tournament_registrations")
    .update({ status: "confirmed", waitlist_position: null })
    .eq("id", nextWaitlist.id);

  // Reorder remaining waitlist positions for this division
  let reorderQuery = supabase
    .from("tournament_registrations")
    .select("id, waitlist_position")
    .eq("tournament_id", tournamentId)
    .eq("status", "waitlist")
    .order("waitlist_position", { ascending: true });

  if (division) {
    reorderQuery = reorderQuery.eq("division", division);
  }

  const { data: remaining } = await reorderQuery;
  if (remaining && remaining.length > 0) {
    for (let i = 0; i < remaining.length; i++) {
      if (remaining[i].waitlist_position !== i + 1) {
        await supabase
          .from("tournament_registrations")
          .update({ waitlist_position: i + 1 })
          .eq("id", remaining[i].id);
      }
    }
  }

  // Fetch tournament info for notification
  const { data: tournament } = await supabase
    .from("tournaments")
    .select("title")
    .eq("id", tournamentId)
    .single();

  const tournamentTitle = tournament?.title ?? "the tournament";

  // Fetch player's user_id for notification
  const { data: playerProfile } = await supabase
    .from("profiles")
    .select("id, user_id")
    .eq("id", nextWaitlist.player_id)
    .single();

  if (playerProfile) {
    await notify({
      profileId: playerProfile.id,
      type: "tournament_registration",
      title: "You're in!",
      body: `A spot opened up and you've been promoted from the waitlist for ${tournamentTitle}.`,
      link: `/tournaments/${tournamentId}`,
      emailTemplate: "TournamentWaitlistPromoted",
      emailData: {
        tournamentTitle,
        tournamentId,
      },
    });
  }

  // Also notify partner if doubles
  if (nextWaitlist.partner_id) {
    const { data: partnerProfile } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", nextWaitlist.partner_id)
      .single();

    if (partnerProfile) {
      await notify({
        profileId: partnerProfile.id,
        type: "tournament_registration",
        title: "You're in!",
        body: `A spot opened up and your team has been promoted from the waitlist for ${tournamentTitle}.`,
        link: `/tournaments/${tournamentId}`,
        emailTemplate: "TournamentWaitlistPromoted",
        emailData: {
          tournamentTitle,
          tournamentId,
        },
      });
    }
  }
}
