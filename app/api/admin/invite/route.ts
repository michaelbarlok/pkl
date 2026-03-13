import { createClient } from "@/lib/supabase/server";
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

    // Send invite email via Resend — recipient registers via /register
    await sendInviteEmail(email, displayName);

    return NextResponse.json(
      { message: `Invite sent to ${email}` },
      { status: 200 }
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
