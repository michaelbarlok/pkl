import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { randomBytes } from "node:crypto";

/**
 * POST /api/tournaments/[id]/partner-invites
 *
 * Inviter is registering for a doubles tournament with someone who
 * isn't on Tri-Star yet. We auto-register the inviter as a
 * Need-Partner registrant (so the slot is held against the cap from
 * the start) and issue a shareable token-protected URL. When the
 * invitee opens the link, the /invite/partner/[token] flow walks
 * them through signup (or login) and then attaches them as the
 * inviter's partner via the matching claim endpoint.
 *
 * Body: { division?: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: tournamentId } = await params;
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const body = await request.json().catch(() => ({}));
  const division: string | null =
    typeof body.division === "string" && body.division.length > 0
      ? body.division
      : null;

  const service = await createServiceClient();

  // Validate tournament + window. Mirrors /register; we don't want
  // an invite to outlive registration.
  const { data: tournament } = await service
    .from("tournaments")
    .select("id, title, type, status, registration_opens_at, registration_closes_at")
    .eq("id", tournamentId)
    .single();
  if (!tournament) {
    return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
  }
  if (tournament.type !== "doubles") {
    return NextResponse.json(
      { error: "Partner invites only apply to doubles tournaments." },
      { status: 400 }
    );
  }
  if (tournament.status !== "registration_open") {
    return NextResponse.json({ error: "Registration isn't open" }, { status: 400 });
  }
  const now = new Date();
  if (
    tournament.registration_opens_at &&
    new Date(tournament.registration_opens_at) > now
  ) {
    return NextResponse.json(
      { error: "Registration hasn't opened yet — check back soon." },
      { status: 400 }
    );
  }
  if (
    tournament.registration_closes_at &&
    new Date(tournament.registration_closes_at) < now
  ) {
    return NextResponse.json({ error: "Registration has closed" }, { status: 400 });
  }

  // Find the inviter's existing registration in this division (if
  // any). If they're already partnered, refuse — they don't need an
  // invite. If they're a Need-Partner registrant, reuse that row.
  // Otherwise we create a new Need-Partner row via the same atomic
  // RPC the regular register flow uses, so capacity / waitlist
  // semantics stay identical.
  let registrationId: string | null = null;
  {
    const { data: existing } = await service
      .from("tournament_registrations")
      .select("id, partner_id, division")
      .eq("tournament_id", tournamentId)
      .or(`player_id.eq.${auth.profile.id},partner_id.eq.${auth.profile.id}`)
      .neq("status", "withdrawn")
      .eq("division", division ?? "");

    if (existing && existing.length > 0) {
      const same = existing.find(
        (r: { division: string | null }) => (r.division ?? "") === (division ?? "")
      );
      if (same?.partner_id) {
        return NextResponse.json(
          {
            error:
              "You already have a partner for this division — you can't send an unregistered invite.",
          },
          { status: 409 }
        );
      }
      if (same) registrationId = same.id;
    }
  }

  if (!registrationId) {
    const { data: newReg, error: regErr } = (await auth.supabase.rpc(
      "register_for_tournament_atomic",
      {
        p_tournament_id: tournamentId,
        p_player_id: auth.profile.id,
        p_partner_id: null,
        p_division: division,
      }
    )) as { data: { id: string } | null; error: { message: string } | null };
    if (regErr || !newReg) {
      return NextResponse.json(
        { error: regErr?.message ?? "Could not create your registration." },
        { status: 500 }
      );
    }
    registrationId = newReg.id;
  }

  // Token: 16 bytes of randomness as URL-safe base64. Long enough to
  // be unguessable, short enough to fit in a text message comfortably.
  const token = randomBytes(16).toString("base64url");

  // Expiry: 14 days, but never past the tournament's registration
  // close. Whatever's sooner.
  const fortnight = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  const expiresAt =
    tournament.registration_closes_at &&
    new Date(tournament.registration_closes_at) < fortnight
      ? new Date(tournament.registration_closes_at)
      : fortnight;

  const { data: inserted, error: insertErr } = await service
    .from("tournament_partner_invites")
    .insert({
      tournament_id: tournamentId,
      registration_id: registrationId,
      inviter_id: auth.profile.id,
      token,
      expires_at: expiresAt.toISOString(),
    })
    .select("id, token")
    .single();
  if (insertErr || !inserted) {
    return NextResponse.json(
      { error: insertErr?.message ?? "Could not create invite." },
      { status: 500 }
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const url = `${appUrl}/invite/partner/${inserted.token}`;

  return NextResponse.json({
    ok: true,
    url,
    token: inserted.token,
    tournamentTitle: tournament.title,
    expiresAt: expiresAt.toISOString(),
  });
}
