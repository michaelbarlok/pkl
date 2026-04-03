import { requireAuth } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: groupId } = await params;

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    // Need extra profile fields for email
    const { data: senderProfile } = await auth.supabase
      .from("profiles")
      .select("id, display_name, email")
      .eq("id", auth.profile.id)
      .single();

    if (!senderProfile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    const body = await request.json();
    const message = body?.message?.trim();
    if (!message) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    const admin = await createServiceClient();

    // Get the group name
    const { data: group } = await admin
      .from("shootout_groups")
      .select("name")
      .eq("id", groupId)
      .single();

    if (!group) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    // Get all group admins
    const { data: groupAdminMemberships } = await admin
      .from("group_memberships")
      .select("player_id")
      .eq("group_id", groupId)
      .eq("group_role", "admin");

    const adminIds = (groupAdminMemberships ?? []).map((m) => m.player_id);

    if (adminIds.length === 0) {
      return NextResponse.json({ error: "No group admins found" }, { status: 404 });
    }

    // Fetch admin emails
    const { data: adminProfiles } = await admin
      .from("profiles")
      .select("email")
      .in("id", adminIds);

    const adminEmails = (adminProfiles ?? [])
      .map((p) => p.email)
      .filter(Boolean);

    if (adminEmails.length === 0) {
      return NextResponse.json({ error: "No admin emails found" }, { status: 404 });
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Email service not configured" }, { status: 500 });
    }

    const { Resend } = await import("resend");
    const resend = new Resend(apiKey);

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";

    const emailComponent = (await import("@/emails/ContactGroupAdmins")).default;

    await resend.emails.send({
      from: "PKL Ball <info@pkl-ball.app>",
      to: adminEmails,
      subject: `Message from ${senderProfile.display_name} about ${group.name}`,
      replyTo: senderProfile.email,
      react: emailComponent({
        senderName: senderProfile.display_name,
        groupName: group.name,
        eventDate: "your group",
        message,
        sheetUrl: `${appUrl}/groups`,
      }),
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
