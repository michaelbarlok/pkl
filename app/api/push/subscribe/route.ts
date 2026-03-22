import { requireAuth } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/push/subscribe
 * Saves a Web Push subscription for the current user.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const { subscription } = await request.json();

    if (!subscription?.endpoint) {
      return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
    }

    // Upsert by endpoint to avoid duplicates (same browser re-subscribing)
    const { error } = await auth.supabase.from("push_subscriptions").upsert(
      {
        profile_id: auth.profile.id,
        endpoint: subscription.endpoint,
        subscription,
      },
      { onConflict: "endpoint" }
    );

    if (error) {
      console.error("Push subscribe error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Also ensure "push" is in the user's preferred_notify
    const { data: profile } = await auth.supabase
      .from("profiles")
      .select("preferred_notify")
      .eq("id", auth.profile.id)
      .single();

    const prefs: string[] = profile?.preferred_notify ?? ["email"];
    if (!prefs.includes("push")) {
      await auth.supabase
        .from("profiles")
        .update({ preferred_notify: [...prefs, "push"] })
        .eq("id", auth.profile.id);
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

/**
 * DELETE /api/push/subscribe
 * Removes a push subscription (user unsubscribed from browser).
 */
export async function DELETE(request: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  try {
    const { endpoint } = await request.json();

    if (!endpoint) {
      return NextResponse.json({ error: "Missing endpoint" }, { status: 400 });
    }

    await auth.supabase
      .from("push_subscriptions")
      .delete()
      .eq("profile_id", auth.profile.id)
      .eq("endpoint", endpoint);

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
