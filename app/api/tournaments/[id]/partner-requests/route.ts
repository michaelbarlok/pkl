import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { notify } from "@/lib/notify";

/**
 * POST /api/tournaments/[id]/partner-requests
 *
 * "Ask to Partner?" — one player (the requester) asks another who's
 * marked Need Partner on this tournament's registered list.
 * Writes a pending row and fires a push+email to the target asking
 * them to confirm or decline via /tournaments/[id].
 *
 * Body: { target_id: string, division?: string }
 *   division is optional — defaults to the target's division.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: tournamentId } = await params;
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const body = await request.json().catch(() => ({}));
  const targetId: string | undefined = body.target_id;
  if (!targetId) {
    return NextResponse.json({ error: "target_id required" }, { status: 400 });
  }
  if (targetId === auth.profile.id) {
    return NextResponse.json({ error: "You can't partner with yourself" }, { status: 400 });
  }

  const service = await createServiceClient();

  const { data: tournament } = await service
    .from("tournaments")
    .select("id, title, type, status")
    .eq("id", tournamentId)
    .single();
  if (!tournament) return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
  if (tournament.type !== "doubles") {
    return NextResponse.json({ error: "Partner requests only apply to doubles" }, { status: 400 });
  }
  if (tournament.status !== "registration_open") {
    return NextResponse.json({ error: "Registration is closed" }, { status: 400 });
  }

  // Target must currently be a Need-Partner registrant (partner_id IS NULL).
  const { data: targetReg } = await service
    .from("tournament_registrations")
    .select("id, division, partner_id, status, player_id")
    .eq("tournament_id", tournamentId)
    .eq("player_id", targetId)
    .neq("status", "withdrawn")
    .maybeSingle();
  if (!targetReg) {
    return NextResponse.json({ error: "That player isn't registered" }, { status: 404 });
  }
  if (targetReg.partner_id) {
    return NextResponse.json({ error: "That player already has a partner" }, { status: 409 });
  }

  // Requester can't already be partnered on this tournament.
  const { data: requesterReg } = await service
    .from("tournament_registrations")
    .select("id, division, partner_id, status")
    .eq("tournament_id", tournamentId)
    .or(`player_id.eq.${auth.profile.id},partner_id.eq.${auth.profile.id}`)
    .neq("status", "withdrawn")
    .maybeSingle();
  if (requesterReg?.partner_id) {
    return NextResponse.json({ error: "You already have a partner for this tournament" }, { status: 409 });
  }

  const division = body.division || targetReg.division;
  if (!division) {
    return NextResponse.json({ error: "division required" }, { status: 400 });
  }

  // De-dup: if there's already a pending request from this requester
  // to this target, return that one.
  const { data: existing } = await service
    .from("tournament_partner_requests")
    .select("id")
    .eq("tournament_id", tournamentId)
    .eq("requester_id", auth.profile.id)
    .eq("target_id", targetId)
    .eq("status", "pending")
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ ok: true, id: existing.id, duplicate: true });
  }

  const { data: inserted, error: insertErr } = await service
    .from("tournament_partner_requests")
    .insert({
      tournament_id: tournamentId,
      division,
      requester_id: auth.profile.id,
      target_id: targetId,
    })
    .select("id")
    .single();
  if (insertErr || !inserted) {
    return NextResponse.json({ error: insertErr?.message ?? "Could not create request" }, { status: 500 });
  }

  // Fire notification to the target.
  const { data: requesterProfile } = await service
    .from("profiles")
    .select("display_name")
    .eq("id", auth.profile.id)
    .single();
  const requesterName = requesterProfile?.display_name ?? "Someone";

  await notify({
    profileId: targetId,
    type: "tournament_partner_request",
    title: `${requesterName} wants to partner with you`,
    body: `Confirm or decline on ${tournament.title}.`,
    link: `/tournaments/${tournamentId}`,
    emailTemplate: "TournamentPartnerRequest",
    emailData: {
      tournamentId,
      tournamentTitle: tournament.title,
      requesterName,
    },
  });

  return NextResponse.json({ ok: true, id: inserted.id });
}
