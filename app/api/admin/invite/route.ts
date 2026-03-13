import { createClient, createServiceClient } from "@/lib/supabase/server";
import { sendInviteEmail } from "./send-email";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    // Verify the calling user is an admin
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { data: callerProfile } = await supabase
      .from("profiles")
      .select("role")
      .eq("user_id", user.id)
      .single();

    if (callerProfile?.role !== "admin") {
      return NextResponse.json(
        { error: "Forbidden: admin access required" },
        { status: 403 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { email, displayName } = body as {
      email?: string;
      displayName?: string;
    };

    if (!email || !displayName) {
      return NextResponse.json(
        { error: "email and displayName are required" },
        { status: 400 }
      );
    }

    // Use service role client to invite the user
    const serviceClient = await createServiceClient();

    const { data: inviteData, error: inviteError } =
      await serviceClient.auth.admin.inviteUserByEmail(email);

    if (inviteError) {
      return NextResponse.json(
        { error: inviteError.message },
        { status: 400 }
      );
    }

    const invitedUserId = inviteData.user?.id;

    if (!invitedUserId) {
      return NextResponse.json(
        { error: "Invite succeeded but no user ID was returned" },
        { status: 500 }
      );
    }

    // Create a profile row in pending/inactive state
    const { data: profile, error: profileError } = await serviceClient
      .from("profiles")
      .insert({
        user_id: invitedUserId,
        full_name: displayName,
        display_name: displayName,
        email,
        is_active: false,
        role: "player",
        member_since: new Date().toISOString(),
        preferred_notify: ["email"],
      })
      .select("*")
      .single();

    if (profileError) {
      return NextResponse.json(
        { error: profileError.message },
        { status: 500 }
      );
    }

    // Send invite email via Resend
    try {
      await sendInviteEmail(email, displayName);
    } catch (err) {
      console.error("Failed to send invite email:", err);
    }

    return NextResponse.json({ profile }, { status: 201 });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
