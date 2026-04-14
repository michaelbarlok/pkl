import { createServiceClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/pending-invite?email=xxx
 *
 * Public endpoint (no auth required) — called from the register form on email
 * blur to pre-fill profile fields from an admin-created invite.
 *
 * Returns: { displayName, firstName, lastName, phone, skillLevel } or 404.
 */
export async function GET(request: NextRequest) {
  const email = request.nextUrl.searchParams.get("email")?.toLowerCase().trim();
  if (!email) {
    return NextResponse.json({ error: "email is required" }, { status: 400 });
  }

  const serviceClient = await createServiceClient();

  const { data } = await serviceClient
    .from("pending_invites")
    .select("display_name, first_name, last_name, phone, skill_level")
    .ilike("email", email)
    .is("used_at", null)
    .order("invited_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) {
    return NextResponse.json({ found: false }, { status: 404 });
  }

  return NextResponse.json({
    found: true,
    displayName: data.display_name ?? undefined,
    firstName: data.first_name ?? undefined,
    lastName: data.last_name ?? undefined,
    phone: data.phone ?? undefined,
    skillLevel: data.skill_level ?? undefined,
  });
}
