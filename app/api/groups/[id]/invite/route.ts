import { requireAuth } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: groupId } = await params;

  const body = await request.json().catch(() => ({})) as {
    email?: string;
    groupName?: string;
    groupSlug?: string;
    visibility?: string;
  };

  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  // Verify caller is a member of this group
  const { data: membership } = await auth.supabase
    .from("group_memberships")
    .select("player_id")
    .eq("group_id", groupId)
    .eq("player_id", auth.profile.id)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ error: "Not a group member" }, { status: 403 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const groupSlug = body.groupSlug ?? "";
  let inviteUrl = `${appUrl}/groups/${groupSlug}`;

  // For private groups, create a token so non-members can access the page
  if (body.visibility === "private") {
    const { data: invite, error: inviteError } = await auth.supabase
      .from("group_invites")
      .insert({ group_id: groupId, created_by: auth.profile.id })
      .select("token")
      .single();

    if (inviteError || !invite) {
      return NextResponse.json({ error: "Failed to create invite token" }, { status: 500 });
    }

    inviteUrl = `${appUrl}/groups/${groupSlug}?token=${invite.token}`;
  }

  // Optionally send email
  if (body.email) {
    try {
      const apiKey = process.env.RESEND_API_KEY;
      if (apiKey) {
        const { Resend } = await import("resend");
        const resend = new Resend(apiKey);
        const { default: GroupInvite } = await import("@/emails/GroupInvite");

        await resend.emails.send({
          from: "Tri-Star Pickleball <info@pkl-ball.app>",
          to: body.email,
          subject: `You're invited to join ${body.groupName ?? "a pickleball group"}`,
          react: GroupInvite({ groupName: body.groupName ?? "a group", inviteUrl }),
        });
      }
    } catch (err) {
      // Don't fail the whole request if email sending fails — return the URL anyway
      console.error("Failed to send group invite email:", err);
    }
  }

  return NextResponse.json({ url: inviteUrl });
}
