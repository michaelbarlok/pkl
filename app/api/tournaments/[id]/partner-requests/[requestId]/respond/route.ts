import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { notify } from "@/lib/notify";

/**
 * POST /api/tournaments/[id]/partner-requests/[requestId]/respond
 *
 * Target accepts or declines. Body: { action: "accept" | "decline" }.
 *   accept  → link partner_id both ways; create the requester's
 *             registration if they didn't have one; auto-decline any
 *             other pending requests involving either player in this
 *             tournament; push the requester a confirmation.
 *   decline → mark declined, notify the requester with guidance to
 *             register again with another partner.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; requestId: string }> }
) {
  const { id: tournamentId, requestId } = await params;
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const body = await request.json().catch(() => ({}));
  const action = body.action;
  if (action !== "accept" && action !== "decline") {
    return NextResponse.json({ error: "action must be accept or decline" }, { status: 400 });
  }

  const service = await createServiceClient();

  const { data: req } = await service
    .from("tournament_partner_requests")
    .select("id, tournament_id, division, requester_id, target_id, status")
    .eq("id", requestId)
    .eq("tournament_id", tournamentId)
    .maybeSingle();
  if (!req) return NextResponse.json({ error: "Request not found" }, { status: 404 });
  if (req.target_id !== auth.profile.id) {
    return NextResponse.json({ error: "Not your request to respond to" }, { status: 403 });
  }
  if (req.status !== "pending") {
    return NextResponse.json({ error: `Already ${req.status}` }, { status: 409 });
  }

  const { data: tournament } = await service
    .from("tournaments")
    .select("id, title, type")
    .eq("id", tournamentId)
    .single();
  if (!tournament) return NextResponse.json({ error: "Tournament not found" }, { status: 404 });

  const [{ data: requesterProfile }, { data: targetProfile }] = await Promise.all([
    service.from("profiles").select("display_name").eq("id", req.requester_id).single(),
    service.from("profiles").select("display_name").eq("id", req.target_id).single(),
  ]);
  const requesterName = requesterProfile?.display_name ?? "The requester";
  const targetName = targetProfile?.display_name ?? "Your partner";

  if (action === "decline") {
    await service
      .from("tournament_partner_requests")
      .update({ status: "declined", responded_at: new Date().toISOString() })
      .eq("id", requestId);

    await notify({
      profileId: req.requester_id,
      type: "tournament_partner_declined",
      title: `${targetName} can't partner this time`,
      body: "Register again with another partner when you're ready.",
      link: `/tournaments/${tournamentId}`,
      emailTemplate: "TournamentPartnerDeclined",
      emailData: {
        tournamentId,
        tournamentTitle: tournament.title,
        targetName,
      },
    });

    return NextResponse.json({ ok: true, status: "declined" });
  }

  // ── Accept ──────────────────────────────────────────────────────
  // Make sure neither side has already been partnered since the
  // request was created (race condition: someone else might have
  // accepted a competing request in the meantime).
  const { data: targetReg } = await service
    .from("tournament_registrations")
    .select("id, division, partner_id, status")
    .eq("tournament_id", tournamentId)
    .eq("player_id", req.target_id)
    .neq("status", "withdrawn")
    .maybeSingle();
  if (!targetReg) {
    return NextResponse.json({ error: "Your registration disappeared" }, { status: 409 });
  }
  if (targetReg.partner_id) {
    return NextResponse.json(
      { error: "You already have a partner for this tournament" },
      { status: 409 }
    );
  }

  const { data: requesterReg } = await service
    .from("tournament_registrations")
    .select("id, division, partner_id, status")
    .eq("tournament_id", tournamentId)
    .or(`player_id.eq.${req.requester_id},partner_id.eq.${req.requester_id}`)
    .neq("status", "withdrawn")
    .maybeSingle();
  if (requesterReg?.partner_id) {
    return NextResponse.json(
      { error: "The requester already has a partner" },
      { status: 409 }
    );
  }

  const division = req.division || targetReg.division;

  // A team is ONE row in tournament_registrations — the partner is
  // tracked as partner_id on that row, not as a second row. Keep the
  // target's row as the single source of truth and link the
  // requester there; if the requester had their own row (e.g. they
  // also posted Need Partner in this tournament) delete it so we
  // don't end up with two rows representing the same team.
  await service
    .from("tournament_registrations")
    .update({ partner_id: req.requester_id, division })
    .eq("id", targetReg.id);

  if (requesterReg) {
    await service
      .from("tournament_registrations")
      .delete()
      .eq("id", requesterReg.id);
  }

  // Flip this request to confirmed; cascade-decline anything else
  // involving either side in this tournament.
  const nowIso = new Date().toISOString();
  await service
    .from("tournament_partner_requests")
    .update({ status: "confirmed", responded_at: nowIso })
    .eq("id", requestId);

  await service
    .from("tournament_partner_requests")
    .update({ status: "cancelled", responded_at: nowIso })
    .eq("tournament_id", tournamentId)
    .eq("status", "pending")
    .or(
      `requester_id.eq.${req.requester_id},target_id.eq.${req.requester_id},requester_id.eq.${req.target_id},target_id.eq.${req.target_id}`
    );

  await notify({
    profileId: req.requester_id,
    type: "tournament_partner_accepted",
    title: `${targetName} is your partner`,
    body: `You're locked in for ${tournament.title}.`,
    link: `/tournaments/${tournamentId}`,
    emailTemplate: "TournamentPartnerAccepted",
    emailData: {
      tournamentId,
      tournamentTitle: tournament.title,
      targetName,
    },
  });

  return NextResponse.json({ ok: true, status: "confirmed" });
}
