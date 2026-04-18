import { requireAuth } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const body = await request.json().catch(() => ({}));
  const { title, description } = body as { title?: string; description?: string };

  if (!description?.trim()) {
    return NextResponse.json({ error: "Description is required" }, { status: 400 });
  }
  if (description.trim().length > 2000) {
    return NextResponse.json({ error: "Description too long" }, { status: 400 });
  }

  const { data: fullProfile } = await auth.supabase
    .from("profiles")
    .select("display_name, email")
    .eq("id", auth.profile.id)
    .single();

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Email not configured" }, { status: 500 });
  }

  const { Resend } = await import("resend");
  const resend = new Resend(apiKey);

  const playerName = fullProfile?.display_name ?? "Unknown Player";
  const playerEmail = fullProfile?.email ?? "";
  const headline = title?.trim() || "(no title)";

  const html = `
    <h2 style="font-family:sans-serif;margin:0 0 16px">Feature Request</h2>
    <table style="font-family:sans-serif;font-size:14px;border-collapse:collapse;width:100%">
      <tr>
        <td style="padding:6px 16px 6px 0;color:#6b7280;white-space:nowrap;vertical-align:top;width:120px">From</td>
        <td style="padding:6px 0;color:#111827">${playerName}${playerEmail ? ` &lt;${playerEmail}&gt;` : ""}</td>
      </tr>
      <tr>
        <td style="padding:6px 16px 6px 0;color:#6b7280;vertical-align:top">Title</td>
        <td style="padding:6px 0;color:#111827;font-weight:600">${headline}</td>
      </tr>
      <tr>
        <td style="padding:6px 16px 6px 0;color:#6b7280;vertical-align:top">Request</td>
        <td style="padding:6px 0;color:#111827;white-space:pre-wrap">${description.trim()}</td>
      </tr>
    </table>
  `;

  const { error } = await resend.emails.send({
    from: "Tri-Star Pickleball <info@tristarpickleball.com>",
    to: "info@tristarpickleball.com",
    replyTo: playerEmail || undefined,
    subject: "Feature Request // Tri-Star Pickleball",
    html,
  });

  if (error) {
    console.error("Feature request email failed:", error);
    return NextResponse.json({ error: "Failed to send" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
