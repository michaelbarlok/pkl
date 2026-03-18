import { requireAdmin } from "@/lib/auth";
import { sendInviteEmail } from "./send-email";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin();
    if (auth instanceof NextResponse) return auth;

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
