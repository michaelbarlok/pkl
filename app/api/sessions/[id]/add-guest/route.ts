import { requireAdmin } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/sessions/[id]/add-guest
 *
 * Adds a one-time guest participant to a session in a private group.
 * Creates an ephemeral profile (is_guest=true, no auth account) then
 * inserts a session_participants row. The guest has no group_membership,
 * so step/win_pct updates after the round silently skip them.
 *
 * Body: { display_name: string, email?: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const { id: sessionId } = await params;
  const body = await request.json();
  const displayName = (body.display_name ?? "").trim();
  const email: string | null = (body.email ?? "").trim() || null;

  if (!displayName) {
    return NextResponse.json({ error: "Guest name is required" }, { status: 400 });
  }

  // Fetch session + group to verify private group
  const { data: session } = await auth.supabase
    .from("shootout_sessions")
    .select("*, group:shootout_groups(id, visibility)")
    .eq("id", sessionId)
    .single();

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  if (session.group?.visibility !== "private") {
    return NextResponse.json(
      { error: "Guests can only be added to private group sessions" },
      { status: 403 }
    );
  }

  // Create ephemeral guest profile
  const { data: guestProfile, error: profileError } = await auth.supabase
    .from("profiles")
    .insert({
      display_name: `${displayName} (Guest)`,
      full_name: displayName,
      email: email ?? `guest-${crypto.randomUUID()}@tristar-guest.invalid`,
      is_guest: true,
      role: "player",
    })
    .select("id")
    .single();

  if (profileError || !guestProfile) {
    return NextResponse.json(
      { error: profileError?.message ?? "Failed to create guest profile" },
      { status: 500 }
    );
  }

  // Add guest as a checked-in session participant with step_before=1
  const { error: partError } = await auth.supabase
    .from("session_participants")
    .insert({
      session_id: sessionId,
      group_id: session.group_id,
      player_id: guestProfile.id,
      checked_in: true,
      step_before: 1,
    });

  if (partError) {
    // Clean up the orphaned profile if participant insert fails
    await auth.supabase.from("profiles").delete().eq("id", guestProfile.id);
    return NextResponse.json(
      { error: partError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    id: guestProfile.id,
    display_name: `${displayName} (Guest)`,
  });
}
