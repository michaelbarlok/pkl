import { createServiceClient } from "@/lib/supabase/server";
import { sendWelcomeEmail } from "@/lib/send-welcome-email";
import { NextRequest, NextResponse } from "next/server";

/**
 * Look up a pending invite by email and return any extra profile fields to apply.
 * Marks the invite as used so it won't be reused.
 */
async function consumePendingInvite(
  serviceClient: Awaited<ReturnType<typeof createServiceClient>>,
  email: string
): Promise<{ phone?: string; skill_level?: number } | null> {
  const { data } = await serviceClient
    .from("pending_invites")
    .select("id, phone, skill_level")
    .ilike("email", email)
    .is("used_at", null)
    .order("invited_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;

  // Mark as used
  await serviceClient
    .from("pending_invites")
    .update({ used_at: new Date().toISOString() })
    .eq("id", data.id);

  return {
    phone: data.phone ?? undefined,
    skill_level: data.skill_level ?? undefined,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, fullName, email } = body as {
      userId?: string;
      fullName?: string;
      email?: string;
    };

    if (!userId || !fullName || !email) {
      return NextResponse.json(
        { error: "userId, fullName, and email are required" },
        { status: 400 }
      );
    }

    const serviceClient = await createServiceClient();

    // Verify the auth user exists
    const { data: authUser, error: authError } =
      await serviceClient.auth.admin.getUserById(userId);

    if (authError || !authUser?.user) {
      return NextResponse.json(
        { error: "Invalid user" },
        { status: 400 }
      );
    }

    // Check if profile already exists (maybeSingle: zero rows is expected, not an error)
    const { data: existing } = await serviceClient
      .from("profiles")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ profile: existing }, { status: 200 });
    }

    // Check for pending invite to pre-populate profile fields
    const pendingData = await consumePendingInvite(serviceClient, email);

    const { data: profile, error: profileError } = await serviceClient
      .from("profiles")
      .insert({
        user_id: userId,
        full_name: fullName,
        display_name: fullName,
        email,
        role: "player",
        member_since: new Date().toISOString(),
        preferred_notify: ["email"],
        ...(pendingData?.phone ? { phone: pendingData.phone } : {}),
        ...(pendingData?.skill_level != null ? { skill_level: pendingData.skill_level } : {}),
      })
      .select("*")
      .single();

    if (profileError) {
      return NextResponse.json(
        { error: profileError.message },
        { status: 500 }
      );
    }

    // Send welcome email in the background (don't block the response)
    sendWelcomeEmail(email, fullName).catch(() => {});

    return NextResponse.json({ profile }, { status: 201 });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
