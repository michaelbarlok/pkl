import { NextRequest, NextResponse } from "next/server";
import { getTournamentManager } from "@/lib/tournament-auth";
import { createServiceClient } from "@/lib/supabase/server";
import { getDivisionLabel } from "@/lib/divisions";

/**
 * POST /api/tournaments/[id]/close-registration
 *
 * Two-phase close:
 *
 *   1. Default call (no body or `{ withdraw_partnerless: false }`):
 *      checks for confirmed registrations missing a partner. If any
 *      exist, returns 409 with the full list so the UI can render
 *      a "these teams need to be fixed" modal.
 *
 *   2. `{ withdraw_partnerless: true }`: marks every partnerless
 *      confirmed registration as withdrawn, then flips the
 *      tournament to registration_closed. Used after the organizer
 *      confirms the modal.
 *
 * Why server-side: the partnerless list has to be authoritative —
 * a client-side check could miss a partner attachment that landed
 * a few ms before the close. Doing it inside the same request that
 * flips the status closes that race.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: tournamentId } = await params;
  const auth = await getTournamentManager(tournamentId);
  if (!auth) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const withdrawPartnerless = body.withdraw_partnerless === true;

  const service = await createServiceClient();

  const { data: tournament } = await service
    .from("tournaments")
    .select("id, status, type")
    .eq("id", tournamentId)
    .single();
  if (!tournament) {
    return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
  }
  if (tournament.status === "registration_closed") {
    return NextResponse.json({ error: "Already closed" }, { status: 400 });
  }
  if (tournament.status !== "registration_open") {
    return NextResponse.json(
      { error: "Tournament isn't in registration_open status." },
      { status: 400 }
    );
  }

  // For singles tournaments there are no partners, so the partnerless
  // check is moot — short-circuit straight to the status flip.
  if (tournament.type !== "doubles") {
    const { error: closeErr } = await service
      .from("tournaments")
      .update({ status: "registration_closed" })
      .eq("id", tournamentId);
    if (closeErr) {
      return NextResponse.json({ error: closeErr.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  // Pull every confirmed registration with no partner_id, plus the
  // player display name for the modal.
  const { data: partnerless } = await service
    .from("tournament_registrations")
    .select(
      "id, division, player:profiles!tournament_registrations_player_id_fkey(display_name)"
    )
    .eq("tournament_id", tournamentId)
    .eq("status", "confirmed")
    .is("partner_id", null);

  type PartnerlessRow = {
    id: string;
    division: string | null;
    player: { display_name: string | null } | { display_name: string | null }[] | null;
  };
  const rows = (partnerless ?? []) as PartnerlessRow[];

  if (rows.length > 0 && !withdrawPartnerless) {
    return NextResponse.json(
      {
        error:
          "Some teams still don't have a partner. Resolve or withdraw them before closing.",
        partnerless_teams: rows.map((r) => {
          const p = Array.isArray(r.player) ? r.player[0] : r.player;
          return {
            id: r.id,
            division: r.division,
            divisionLabel: r.division ? getDivisionLabel(r.division) : null,
            playerName: p?.display_name ?? "Unknown",
          };
        }),
      },
      { status: 409 }
    );
  }

  // Withdraw partnerless rows (if asked), then close. Bulk update so
  // a slow per-row loop can't drift the count between the
  // partnerless query and the status flip.
  if (rows.length > 0 && withdrawPartnerless) {
    const ids = rows.map((r) => r.id);
    const { error: withdrawErr } = await service
      .from("tournament_registrations")
      .update({ status: "withdrawn" })
      .in("id", ids);
    if (withdrawErr) {
      return NextResponse.json(
        { error: `Failed to withdraw partnerless teams: ${withdrawErr.message}` },
        { status: 500 }
      );
    }
  }

  const { error: closeErr } = await service
    .from("tournaments")
    .update({ status: "registration_closed" })
    .eq("id", tournamentId);
  if (closeErr) {
    return NextResponse.json({ error: closeErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    withdrew: rows.length,
  });
}
