import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * DELETE /api/tournaments/[id]/partner-requests/[requestId]
 *
 * The requester cancels their own pending partner request. No
 * notification fires — a cancelled request is a no-op to the target
 * (they either never saw it or ignored it). Only the original
 * requester may cancel; targets use /respond to decline.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; requestId: string }> }
) {
  const { id: tournamentId, requestId } = await params;
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const service = await createServiceClient();
  const { data: req } = await service
    .from("tournament_partner_requests")
    .select("id, requester_id, status")
    .eq("id", requestId)
    .eq("tournament_id", tournamentId)
    .maybeSingle();
  if (!req) return NextResponse.json({ error: "Request not found" }, { status: 404 });
  if (req.requester_id !== auth.profile.id) {
    return NextResponse.json({ error: "Not your request to cancel" }, { status: 403 });
  }
  if (req.status !== "pending") {
    return NextResponse.json({ error: `Request is already ${req.status}` }, { status: 409 });
  }

  await service
    .from("tournament_partner_requests")
    .update({ status: "cancelled", responded_at: new Date().toISOString() })
    .eq("id", requestId);

  return NextResponse.json({ ok: true });
}
