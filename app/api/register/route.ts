import { createServiceClient } from "@/lib/supabase/server";
import { ensureProfile } from "@/lib/ensure-profile";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/register
 *
 * Legacy / direct-call profile-provisioning endpoint. The primary
 * creation path now runs server-side from /auth/confirm (after email
 * verify) and /auth/callback (after OAuth exchange) — both of which
 * call ensureProfile() directly with the verified auth user. This
 * endpoint stays for any external caller that posts a user-id+name
 * payload, and routes through the same ensureProfile helper.
 *
 * Hardening:
 *   - Verifies the userId resolves to a real auth user.
 *   - Verifies the body email matches the auth user's email (case
 *     insensitive). Without this guard, a hand-rolled payload could
 *     have written `email = victim@x.com` for an unrelated userId.
 *   - Stores the explicit first_name / last_name on the auth user's
 *     metadata before delegating to ensureProfile, so the helper's
 *     name-resolution priority picks them up.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, fullName, firstName, lastName, email } = body as {
      userId?: string;
      fullName?: string;
      firstName?: string;
      lastName?: string;
      email?: string;
    };

    // Normalize: prefer explicit first/last; fall back to splitting fullName.
    const trimmedFirst = (firstName ?? "").trim();
    const trimmedLast = (lastName ?? "").trim();
    const trimmedFull = (fullName ?? "").trim();
    const resolvedFirst =
      trimmedFirst ||
      (trimmedFull.includes(" ")
        ? trimmedFull.slice(0, trimmedFull.indexOf(" ")).trim()
        : trimmedFull);
    const resolvedLast =
      trimmedLast ||
      (trimmedFull.includes(" ")
        ? trimmedFull.slice(trimmedFull.indexOf(" ") + 1).trim()
        : "");
    const resolvedFull =
      trimmedFull || [resolvedFirst, resolvedLast].filter(Boolean).join(" ");

    if (!userId || !resolvedFull || !email) {
      return NextResponse.json(
        { error: "userId, name, and email are required" },
        { status: 400 }
      );
    }

    const serviceClient = await createServiceClient();

    const { data: authUser, error: authError } =
      await serviceClient.auth.admin.getUserById(userId);

    if (authError || !authUser?.user) {
      return NextResponse.json({ error: "Invalid user" }, { status: 400 });
    }

    // Reject when the body email doesn't match the auth user's email.
    // The auth user's email is the source of truth — verifyOtp already
    // confirmed it. Trusting whatever email the client posts here would
    // let a malicious payload write a profile row with someone else's
    // address attached to a real userId.
    const authEmail = (authUser.user.email ?? "").toLowerCase();
    if (authEmail && authEmail !== email.toLowerCase()) {
      return NextResponse.json(
        { error: "Email does not match the authenticated user." },
        { status: 403 }
      );
    }

    // Pass the explicit first/last through user_metadata so ensureProfile
    // picks them up rather than re-splitting full_name.
    const meta = (authUser.user.user_metadata ?? {}) as Record<string, unknown>;
    const enrichedUser = {
      ...authUser.user,
      user_metadata: {
        ...meta,
        full_name: meta.full_name ?? resolvedFull,
        first_name: meta.first_name ?? (resolvedFirst || undefined),
        last_name: meta.last_name ?? (resolvedLast || undefined),
      },
    };

    const result = await ensureProfile(serviceClient, enrichedUser);
    if (!result) {
      return NextResponse.json(
        { error: "Failed to create profile" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { profile: result.profile },
      { status: result.created ? 201 : 200 }
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
