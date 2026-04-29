import { createClient, createServiceClient } from "@/lib/supabase/server";
import { ensureProfile } from "@/lib/ensure-profile";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Google OAuth callback. Exchanges the authorization code for a session,
 * then delegates profile provisioning to ensureProfile() — the same
 * helper the email/password verify flow and the layout fallback use.
 *
 * ensureProfile handles: name parsing (given_name / family_name),
 * avatar_url, pending invite consumption (phone / skill_level),
 * pending group-membership claim, and the welcome email — all
 * idempotent, all gated on whether the row was actually inserted.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { data: sessionData, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && sessionData?.user) {
      try {
        const serviceClient = await createServiceClient();
        await ensureProfile(serviceClient, sessionData.user);
      } catch {
        // Non-fatal — the (app)/layout fallback will run on next page load.
      }
      return NextResponse.redirect(new URL(next, request.url));
    }
  }

  return NextResponse.redirect(new URL("/login?error=oauth_error", request.url));
}
