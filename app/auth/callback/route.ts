import { createClient, createServiceClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { data: sessionData, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && sessionData?.user) {
      const user = sessionData.user;

      // Ensure a profile exists — Google OAuth users skip /api/register
      const serviceClient = await createServiceClient();
      const { data: existing } = await serviceClient
        .from("profiles")
        .select("id")
        .eq("user_id", user.id)
        .single();

      if (!existing) {
        const fullName =
          user.user_metadata?.full_name ||
          user.user_metadata?.name ||
          user.email?.split("@")[0] ||
          "Player";

        const avatarUrl =
          user.user_metadata?.avatar_url ||
          user.user_metadata?.picture ||
          null;

        // Use upsert so concurrent requests don't cause a duplicate-key error
        await serviceClient.from("profiles").upsert(
          {
            user_id: user.id,
            full_name: fullName,
            display_name: fullName,
            email: user.email ?? "",
            role: "player",
            member_since: new Date().toISOString(),
            preferred_notify: ["email"],
            ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
          },
          { onConflict: "user_id", ignoreDuplicates: true }
        );
      }

      return NextResponse.redirect(new URL(next, request.url));
    }
  }

  return NextResponse.redirect(new URL("/login?error=oauth_error", request.url));
}
