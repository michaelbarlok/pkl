import { requireAuth } from "@/lib/auth";
import { checkAndAwardBadges } from "@/lib/badges";
import { createServiceClient } from "@/lib/supabase/server";
import { notify } from "@/lib/notify";
import { getDivisionLabel } from "@/lib/divisions";
import { revalidatePath } from "next/cache";
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

  // Hidden tournaments are invite-only. Refuse registrations from
  // anyone but the organizer team — the URL might be in circulation
  // if someone pasted it into a group chat, and we don't want
  // strangers to sneak onto a private bracket.
  if (tournament.is_hidden) {
    const [{ data: org }, isCreator] = await Promise.all([
      auth.supabase
        .from("tournament_organizers")
        .select("profile_id")
        .eq("tournament_id", tournamentId)
        .eq("profile_id", auth.profile.id)
        .maybeSingle(),
      Promise.resolve(tournament.created_by === auth.profile.id),
    ]);
    const isAdmin = auth.profile.role === "admin";
    if (!isCreator && !isAdmin && !org) {
      return NextResponse.json({ error: "Registration is not open" }, { status: 400 });
    }
  }

  // Honor the registration window timestamps. Status is the primary
  // gate but these columns exist for a reason — respect them so
  // organizers don't have to be awake at 8am to flip the status.
  // Don't toLocaleString server-side: this route runs on Vercel
  // (UTC) and would print UTC clock times in the error message,
  // confusing players who set the window in their local zone.
  const now = new Date();
  if (tournament.registration_opens_at && new Date(tournament.registration_opens_at) > now) {
    return NextResponse.json(
      { error: "Registration hasn't opened yet — check back soon." },
      { status: 400 }
    );
  }
  if (tournament.registration_closes_at && new Date(tournament.registration_closes_at) < now) {
    return NextResponse.json(
      { error: "Registration has closed" },
      { status: 400 }
    );
  }

  // Singles tournaments shouldn't accept a partner on the payload.
  if (tournament.type === "singles" && partner_id) {
    return NextResponse.json(
      { error: "This is a singles tournament — partner_id is not allowed" },
      { status: 400 }
    );
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

  // Cap check + insert run atomically in an RPC that locks the
  // tournament row FOR UPDATE. Without this, two simultaneous
  // registrations could both read `count < cap` and both insert as
  // confirmed, silently exceeding the cap. The RPC also handles
  // withdrawn-row reuse and waitlist-position computation so the
  // whole "slot me in" step is one atomic hop.
  const { data: registration, error } = await auth.supabase.rpc(
    "register_for_tournament_atomic",
    {
      p_tournament_id: tournamentId,
      p_player_id: auth.profile.id,
      p_partner_id: partner_id || null,
      p_division: division || null,
    }
  ) as { data: any; error: any };

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const status = (registration?.status as string) ?? "confirmed";
  const waitlistPosition = (registration?.waitlist_position as number | null) ?? null;

  // Check tournament badges (non-blocking)
  checkAndAwardBadges(auth.profile.id, ["tournament"]).catch(() => {});

  // Send registration notification — non-blocking, test users are suppressed inside notify()
  const notifTitle = status === "confirmed" ? "Registration Confirmed!" : "You're on the Waitlist";
  const notifBody = status === "confirmed"
    ? `Your registration for ${tournament.title} is confirmed.`
    : `You've been added to the waitlist (#${waitlistPosition}) for ${tournament.title}.`;

  // Fetch player + partner display names so each email shows who they're playing with
  const profileIds = [auth.profile.id, ...(partner_id ? [partner_id] : [])];
  const { data: nameRows } = await auth.supabase
    .from("profiles")
    .select("id, display_name")
    .in("id", profileIds);
  const nameMap = Object.fromEntries((nameRows ?? []).map((r) => [r.id, r.display_name]));
  const playerName = nameMap[auth.profile.id];
  const partnerName = partner_id ? nameMap[partner_id] : undefined;

  const baseEmailData = {
    tournamentTitle: tournament.title,
    tournamentId,
    status,
    ...(waitlistPosition ? { waitlistPosition } : {}),
    ...(division ? { divisionLabel: getDivisionLabel(division) } : {}),
  };

  notify({ profileId: auth.profile.id, type: "tournament_registration", title: notifTitle, body: notifBody, link: `/tournaments/${tournamentId}`, emailTemplate: "TournamentRegistered", emailData: { ...baseEmailData, ...(partnerName ? { partnerName } : {}) } }).catch(() => {});

  if (partner_id) {
    notify({ profileId: partner_id, type: "tournament_registration", title: notifTitle, body: notifBody, link: `/tournaments/${tournamentId}`, emailTemplate: "TournamentRegistered", emailData: { ...baseEmailData, ...(playerName ? { partnerName: playerName } : {}) } }).catch(() => {});
  }

  revalidatePath(`/tournaments/${tournamentId}`);
  revalidatePath("/tournaments");

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

  // Once the tournament is live, self-service withdrawal gets messy —
  // matches are already scheduled and the opponent will show up to
  // play a ghost. Block it here; organizers can still mark a
  // registration withdrawn server-side if they need to forfeit a
  // team. Completed tournaments are also locked.
  const { data: tournament } = await auth.supabase
    .from("tournaments")
    .select("status, title")
    .eq("id", tournamentId)
    .single();
  if (!tournament) {
    return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
  }
  if (tournament.status === "in_progress" || tournament.status === "completed") {
    return NextResponse.json(
      {
        error:
          "This tournament is already underway. Contact an organizer to drop out — we can't remove a team mid-play without breaking the bracket.",
      },
      { status: 409 }
    );
  }

  // Find registration (include player/partner ids for notifications)
  const { data: reg } = await auth.supabase
    .from("tournament_registrations")
    .select("id, status, division, player_id, partner_id")
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

  // Send withdrawal notification — non-blocking, test users suppressed inside notify()
  const tournamentTitle = tournament?.title ?? "the tournament";
  const withdrawalEmailData = { tournamentTitle, tournamentId };

  notify({ profileId: reg.player_id, type: "tournament_withdrawal", title: "Withdrawal Confirmed", body: `You have been withdrawn from ${tournamentTitle}.`, link: `/tournaments/${tournamentId}`, emailTemplate: "TournamentWithdrawal", emailData: withdrawalEmailData }).catch(() => {});

  if (reg.partner_id) {
    notify({ profileId: reg.partner_id, type: "tournament_withdrawal", title: "Withdrawal Confirmed", body: `Your team has been withdrawn from ${tournamentTitle}.`, link: `/tournaments/${tournamentId}`, emailTemplate: "TournamentWithdrawal", emailData: withdrawalEmailData }).catch(() => {});
  }

  revalidatePath(`/tournaments/${tournamentId}`);
  revalidatePath("/tournaments");

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

  const { data: nextWaitlist } = await query.maybeSingle();

  if (!nextWaitlist) return;

  // Promote to confirmed
  await supabase
    .from("tournament_registrations")
    .update({ status: "confirmed", waitlist_position: null })
    .eq("id", nextWaitlist.id);

  // Reorder remaining waitlist positions for this division in a single RPC call
  await supabase.rpc("reorder_tournament_waitlist", {
    p_tournament_id: tournamentId,
    p_division: division ?? null,
  });

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
