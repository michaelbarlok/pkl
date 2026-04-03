import { requireAuth } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { formatDate } from "@/lib/utils";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sheetId } = await params;

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

    // Get the sheet and its group
    const { data: sheet } = await admin
      .from("signup_sheets")
      .select("group_id, event_date, group:shootout_groups(name)")
      .eq("id", sheetId)
      .single();

    if (!sheet) {
      return NextResponse.json({ error: "Sheet not found" }, { status: 404 });
    }

    const groupName = (sheet as any)?.group?.name ?? "the group";
    const eventDate = sheet.event_date ?? "";

    // Get all group admins (group_role = 'admin') and global admins
    const { data: groupAdminMemberships } = await admin
      .from("group_memberships")
      .select("player_id")
      .eq("group_id", sheet.group_id)
      .eq("group_role", "admin");

    const groupAdminPlayerIds = (groupAdminMemberships ?? []).map((m) => m.player_id);

    // Also get global admins
    const { data: globalAdmins } = await admin
      .from("profiles")
      .select("id")
      .eq("role", "admin");

    const globalAdminIds = (globalAdmins ?? []).map((a) => a.id);

    // Combine and deduplicate
    const allAdminIds = [...new Set([...groupAdminPlayerIds, ...globalAdminIds])];

    if (allAdminIds.length === 0) {
      return NextResponse.json(
        { error: "No group admins found" },
        { status: 404 }
      );
    }

    // Fetch admin emails
    const { data: adminProfiles } = await admin
      .from("profiles")
      .select("email")
      .in("id", allAdminIds);

    const adminEmails = (adminProfiles ?? [])
      .map((p) => p.email)
      .filter(Boolean);

    if (adminEmails.length === 0) {
      return NextResponse.json(
        { error: "No admin emails found" },
        { status: 404 }
      );
    }

    // Send a single email to all admins
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Email service not configured" },
        { status: 500 }
      );
    }

    const { Resend } = await import("resend");
    const resend = new Resend(apiKey);

    let emailComponent;
    try {
      emailComponent = (await import("@/emails/ContactGroupAdmins")).default;
    } catch {
      return NextResponse.json(
        { error: "Email template not found" },
        { status: 500 }
      );
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
    const sheetUrl = `${appUrl}/sheets/${sheetId}`;

    await resend.emails.send({
      from: "PKL Ball <info@pkl-ball.app>",
      to: adminEmails,
      subject: `Message from ${senderProfile.display_name} about ${groupName}`,
      replyTo: senderProfile.email,
      react: emailComponent({
        senderName: senderProfile.display_name,
        groupName,
        eventDate: eventDate
          ? formatDate(eventDate)
          : "upcoming date",
        message,
        sheetUrl,
      }),
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
