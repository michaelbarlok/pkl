import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { notify, notifyMany } from "@/lib/notify";

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

  // Refuse to silently move the target across divisions. The request
  // carries its own `division` field which the previous code happily
  // wrote back onto the target's registration row, so a request
  // pointing at a different division would teleport the target into
  // it on accept — and, since a different division means a different
  // capacity bucket, could push that division over `max_teams_per_
  // division` without ever counting the move. Forcing the request
  // and the target's own registration to agree means: (a) no silent
  // cross-division team movement, and (b) accept never changes the
  // count in any division (it just attaches a partner_id), which is
  // why a separate capacity check isn't needed here.
  if (req.division && req.division !== targetReg.division) {
    return NextResponse.json(
      {
        error:
          "This request was made for a different division than you're registered in. Ask them to send a new request matching your division.",
      },
      { status: 409 }
    );
  }
  const division = targetReg.division;

  // A team is ONE row in tournament_registrations — the partner is
  // tracked as partner_id on that row, not as a second row. Keep the
  // target's row as the single source of truth and link the
  // requester there; if the requester had their own row (e.g. they
  // also posted Need Partner in this tournament) delete it so we
  // don't end up with two rows representing the same team.
  //
  // The conditional `partner_id IS NULL` clause is the atomicity
  // guard: two simultaneous accepts on competing requests can both
  // pass the in-memory checks above (the SELECT-then-UPDATE window),
  // but only one UPDATE will actually match the row at the database
  // level — Postgres acquires the row lock and re-evaluates WHERE
  // under it, so the loser sees zero rows updated and we abort.
  // Without this clause the loser would silently overwrite the
  // winner and produce a corrupted team.
  const { data: linked, error: linkErr } = await service
    .from("tournament_registrations")
    .update({ partner_id: req.requester_id, division })
    .eq("id", targetReg.id)
    .is("partner_id", null)
    .select("id")
    .maybeSingle();
  if (linkErr || !linked) {
    return NextResponse.json(
      { error: "You already have a partner for this tournament" },
      { status: 409 }
    );
  }

  if (requesterReg) {
    await service
      .from("tournament_registrations")
      .delete()
      .eq("id", requesterReg.id);
  }

  // Flip this request to confirmed; cascade-decline anything else
  // involving either side in this tournament. The status='pending'
  // guard mirrors the partner_id IS NULL guard above — if a parallel
  // accept somehow already advanced this request we don't want to
  // double-fire the side-effects below.
  const nowIso = new Date().toISOString();
  await service
    .from("tournament_partner_requests")
    .update({ status: "confirmed", responded_at: nowIso })
    .eq("id", requestId)
    .eq("status", "pending");

  // Find every other pending request that involves either side of
  // this newly-confirmed pairing. Fetch BEFORE the cascade-cancel
  // update so we still have the row IDs + requester/target ids to
  // notify the people whose requests just got invalidated.
  const { data: othersToCancel } = await service
    .from("tournament_partner_requests")
    .select("id, requester_id, target_id")
    .eq("tournament_id", tournamentId)
    .eq("status", "pending")
    .neq("id", requestId)
    .or(
      `requester_id.eq.${req.requester_id},target_id.eq.${req.requester_id},requester_id.eq.${req.target_id},target_id.eq.${req.target_id}`
    );

  if ((othersToCancel ?? []).length > 0) {
    await service
      .from("tournament_partner_requests")
      .update({ status: "cancelled", responded_at: nowIso })
      .in(
        "id",
        (othersToCancel ?? []).map((r: any) => r.id)
      );

    // Notify each affected requester their request was invalidated.
    // Skip notifying the people who just got paired — they already
    // got a "you're locked in" push above. Targets of cancelled
    // requests don't get a notification (they never acted, no UI
    // surprise to dismiss).
    const pairedIds = new Set([req.requester_id, req.target_id]);
    const requestersToNotify = new Set<string>();
    for (const row of othersToCancel ?? []) {
      const r = row as any;
      if (!pairedIds.has(r.requester_id)) requestersToNotify.add(r.requester_id);
    }
    if (requestersToNotify.size > 0) {
      await notifyMany(Array.from(requestersToNotify), {
        type: "tournament_partner_declined",
        title: "Partner request closed",
        body: `Your partner request for ${tournament.title} was cancelled — they paired up with someone else. Try another player.`,
        link: `/tournaments/${tournamentId}`,
        emailTemplate: "TournamentPartnerDeclined",
        emailData: {
          tournamentId,
          tournamentTitle: tournament.title,
          targetName: "your prospective partner",
        },
      });
    }
  }

  // Notify BOTH sides — requester gets "your partner accepted" and
  // the target (who just tapped Accept) gets a confirmation too so
  // the UI doesn't go silent after their action.
  await Promise.all([
    notify({
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
    }),
    notify({
      profileId: req.target_id,
      type: "tournament_partner_accepted",
      title: `${requesterName} is your partner`,
      body: `You're locked in for ${tournament.title}.`,
      link: `/tournaments/${tournamentId}`,
      emailTemplate: "TournamentPartnerAccepted",
      emailData: {
        tournamentId,
        tournamentTitle: tournament.title,
        targetName: requesterName,
      },
    }),
  ]);

  return NextResponse.json({ ok: true, status: "confirmed" });
}
