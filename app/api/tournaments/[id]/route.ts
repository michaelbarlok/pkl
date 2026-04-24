import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getTournamentManager } from "@/lib/tournament-auth";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * PATCH: Toggle is_hidden on a tournament (global admin only).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: tournamentId } = await params;

  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const body = await request.json().catch(() => ({}));
  const { is_hidden } = body as { is_hidden?: boolean };

  if (typeof is_hidden !== "boolean") {
    return NextResponse.json({ error: "is_hidden (boolean) is required" }, { status: 400 });
  }

  const serviceClient = await createServiceClient();
  const { error } = await serviceClient
    .from("tournaments")
    .update({ is_hidden })
    .eq("id", tournamentId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ id: tournamentId, is_hidden });
}

/**
 * PUT: Update tournament fields (creator, co-organizer, or admin).
 *
 * Centralized on the server so we can (a) enforce auth beyond RLS
 * and (b) refuse changes that would corrupt existing registrations:
 *   - Flipping doubles ↔ singles while teams are registered.
 *   - Removing a division that has non-withdrawn registrations.
 */
const EDITABLE_FIELDS = new Set([
  "title",
  "description",
  "format",
  "type",
  "divisions",
  "start_date",
  "end_date",
  "start_time",
  "location",
  "player_cap",
  "max_teams_per_division",
  "entry_fee",
  "payment_options",
  "payment_link",
  "payment_directions",
  "registration_opens_at",
  "registration_closes_at",
  "score_to_win_pool",
  "score_to_win_playoff",
  "finals_best_of_3",
  "num_courts",
  "logo_url",
]);

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: tournamentId } = await params;
  const auth = await getTournamentManager(tournamentId);
  if (!auth) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const updates: Record<string, unknown> = {};
  for (const key of Object.keys(body)) {
    if (EDITABLE_FIELDS.has(key)) updates[key] = body[key];
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No editable fields in request" }, { status: 400 });
  }

  const service = await createServiceClient();
  const { data: current } = await service
    .from("tournaments")
    .select("type, divisions, status")
    .eq("id", tournamentId)
    .single();
  if (!current) return NextResponse.json({ error: "Tournament not found" }, { status: 404 });

  const { data: liveRegs } = await service
    .from("tournament_registrations")
    .select("division, partner_id")
    .eq("tournament_id", tournamentId)
    .neq("status", "withdrawn");
  const regs = (liveRegs ?? []) as { division: string; partner_id: string | null }[];

  // H6: block type flip when teams are registered. A doubles→singles
  // flip leaves orphan partner_id values; singles→doubles leaves
  // half-teams with no partner.
  if (typeof updates.type === "string" && updates.type !== current.type && regs.length > 0) {
    return NextResponse.json(
      {
        error:
          `Can't change the tournament type from ${current.type} to ${updates.type} — ${regs.length} registration${regs.length === 1 ? "" : "s"} exist. Withdraw everyone first or keep the current type.`,
      },
      { status: 409 }
    );
  }

  // H7: block removal of a division with registrations.
  if (Array.isArray(updates.divisions)) {
    const nextDivisions = new Set(updates.divisions as string[]);
    const orphaned = new Set<string>();
    for (const r of regs) {
      if (r.division && !nextDivisions.has(r.division)) orphaned.add(r.division);
    }
    if (orphaned.size > 0) {
      return NextResponse.json(
        {
          error: `Can't remove division${orphaned.size === 1 ? "" : "s"} ${Array.from(orphaned).join(", ")} — registrations still reference ${orphaned.size === 1 ? "it" : "them"}.`,
        },
        { status: 409 }
      );
    }
  }

  const { error } = await service
    .from("tournaments")
    .update(updates)
    .eq("id", tournamentId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ id: tournamentId, ok: true });
}

/**
 * DELETE: Delete a tournament (creator, co-organizer, or admin).
 * Cascades to tournament_registrations and tournament_matches via FK.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: tournamentId } = await params;
  const auth = await getTournamentManager(tournamentId);
  if (!auth) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  // Delete tournament (cascades to registrations and matches)
  const { error } = await auth.supabase
    .from("tournaments")
    .delete()
    .eq("id", tournamentId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ status: "deleted" });
}
