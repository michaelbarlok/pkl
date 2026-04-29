import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { notify } from "@/lib/notify";
import { getDivisionGender, getDivisionLabel } from "@/lib/divisions";

/**
 * POST /api/invite/partner/[token]/claim
 *
 * Invitee (must be signed in) accepts a partner-invite link. We
 * attach them as partner_id on the inviter's existing Need-Partner
 * registration, mark the invite claimed, and notify the inviter.
 *
 * The atomic guard is `partner_id IS NULL` on the registration row
 * — same pattern the partner-request /respond endpoint uses to
 * survive concurrent claims.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const service = await createServiceClient();

  const { data: invite } = await service
    .from("tournament_partner_invites")
    .select("id, tournament_id, registration_id, inviter_id, status, expires_at")
    .eq("token", token)
    .maybeSingle();
  if (!invite) {
    return NextResponse.json({ error: "Invite not found" }, { status: 404 });
  }
  if (invite.status !== "pending") {
    return NextResponse.json(
      { error: `Invite is already ${invite.status}.` },
      { status: 409 }
    );
  }
  if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    await service
      .from("tournament_partner_invites")
      .update({ status: "expired" })
      .eq("id", invite.id);
    return NextResponse.json({ error: "Invite has expired." }, { status: 410 });
  }
  if (invite.inviter_id === auth.profile.id) {
    return NextResponse.json(
      { error: "You can't claim your own invite." },
      { status: 400 }
    );
  }

  const { data: registration } = await service
    .from("tournament_registrations")
    .select("id, tournament_id, division, partner_id, status, player_id")
    .eq("id", invite.registration_id)
    .maybeSingle();
  if (!registration) {
    return NextResponse.json(
      { error: "The original registration no longer exists." },
      { status: 404 }
    );
  }
  if (registration.status === "withdrawn") {
    return NextResponse.json(
      { error: "The original registrant has withdrawn — invite no longer valid." },
      { status: 410 }
    );
  }
  if (registration.partner_id) {
    return NextResponse.json(
      { error: "The original registrant already has a partner." },
      { status: 409 }
    );
  }

  // Conflict check on the claimer's side: a player already in a same-
  // gender division can't take a second slot in another same-gender
  // division. Mirrors the gender bucket logic in /register so the
  // invite path can't sidestep it.
  const division = registration.division;
  const newGender = division ? getDivisionGender(division) : null;
  const { data: claimerRegs } = await service
    .from("tournament_registrations")
    .select("division, partner_id, player_id")
    .eq("tournament_id", invite.tournament_id)
    .or(`player_id.eq.${auth.profile.id},partner_id.eq.${auth.profile.id}`)
    .neq("status", "withdrawn");

  const myRows = (claimerRegs ?? []).filter(
    (r: { player_id: string; partner_id: string | null }) =>
      r.player_id === auth.profile.id || r.partner_id === auth.profile.id
  );
  if (myRows.some((r: { division: string | null }) => r.division === division)) {
    return NextResponse.json(
      { error: "You're already registered in this division." },
      { status: 409 }
    );
  }
  if (newGender) {
    const existingGenders = new Set(
      myRows
        .map((r: { division: string | null }) =>
          r.division ? getDivisionGender(r.division) : null
        )
        .filter((g): g is NonNullable<typeof g> => !!g)
    );
    if (
      (newGender === "mens" || newGender === "womens") &&
      (existingGenders.has("mens") || existingGenders.has("womens"))
    ) {
      return NextResponse.json(
        {
          error:
            "You're already in a Men's or Women's division — you can only add Mixed alongside it.",
        },
        { status: 409 }
      );
    }
    if (newGender === "mixed" && existingGenders.has("mixed")) {
      return NextResponse.json(
        { error: "You're already in a Mixed division." },
        { status: 409 }
      );
    }
  }

  // Atomic attach. The IS NULL guard means a parallel claim that
  // already won will leave us with zero rows updated — at which point
  // we abort with 409 just like the /respond endpoint does.
  const { data: linked, error: linkErr } = await service
    .from("tournament_registrations")
    .update({ partner_id: auth.profile.id })
    .eq("id", registration.id)
    .is("partner_id", null)
    .select("id")
    .maybeSingle();
  if (linkErr || !linked) {
    return NextResponse.json(
      { error: "The original registrant just paired with someone else." },
      { status: 409 }
    );
  }

  // Mark the invite as claimed.
  const claimedAtIso = new Date().toISOString();
  await service
    .from("tournament_partner_invites")
    .update({
      status: "claimed",
      claimed_by: auth.profile.id,
      claimed_at: claimedAtIso,
    })
    .eq("id", invite.id);

  // Cancel every OTHER pending invite tied to the same registration.
  // The inviter may have shared the link with multiple people — first
  // claim wins, the rest are out of luck. Without this cascade, a
  // second claimant would hit the partner_id-IS-NULL guard and see a
  // generic 409 with no clear explanation; cancelling the rows up
  // front means the landing page surfaces a clean "this invite was
  // claimed by someone else" message instead.
  await service
    .from("tournament_partner_invites")
    .update({ status: "cancelled", claimed_at: claimedAtIso })
    .eq("registration_id", invite.registration_id)
    .eq("status", "pending")
    .neq("id", invite.id);

  // Auto-cancel any outstanding partner requests involving the
  // claimer or inviter — same housekeeping the regular accept flow
  // does so a stale request doesn't sit around forever.
  await service
    .from("tournament_partner_requests")
    .update({
      status: "cancelled",
      responded_at: new Date().toISOString(),
    })
    .eq("tournament_id", invite.tournament_id)
    .eq("status", "pending")
    .or(
      `requester_id.eq.${auth.profile.id},target_id.eq.${auth.profile.id},requester_id.eq.${invite.inviter_id},target_id.eq.${invite.inviter_id}`
    );

  // Notify the inviter — their unregistered partner just became
  // their actual partner.
  const [{ data: tournament }, { data: claimerProfile }] = await Promise.all([
    service.from("tournaments").select("title").eq("id", invite.tournament_id).single(),
    service.from("profiles").select("display_name").eq("id", auth.profile.id).single(),
  ]);
  const tournamentTitle = tournament?.title ?? "the tournament";
  const claimerName = claimerProfile?.display_name ?? "Your partner";
  const divisionLabel = division ? getDivisionLabel(division) : null;

  notify({
    profileId: invite.inviter_id,
    type: "tournament_partner_accepted",
    title: `${claimerName} is your partner`,
    body: `${claimerName} signed up via your invite link. You're locked in for ${tournamentTitle}${divisionLabel ? ` (${divisionLabel})` : ""}.`,
    link: `/tournaments/${invite.tournament_id}`,
    emailTemplate: "TournamentPartnerAccepted",
    emailData: {
      tournamentId: invite.tournament_id,
      tournamentTitle,
      targetName: claimerName,
    },
  }).catch(() => {});

  return NextResponse.json({
    ok: true,
    tournamentId: invite.tournament_id,
    registrationId: registration.id,
  });
}
