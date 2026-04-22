import { requireAuth } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

type FeedbackKind = "feature" | "bug";
type FeedbackAttachment = { name: string; type: string; data: string };

// Matches the client-side cap in components/feedback-button.tsx. We
// check raw-decoded size (not base64 length) to stay consistent with
// the "3 MB" the user sees.
const MAX_ATTACHMENT_BYTES = 3 * 1024 * 1024;
const ALLOWED_ATTACHMENT_TYPES = /^(image\/(png|jpe?g|gif|webp|heic|heif)|application\/pdf)$/i;

/**
 * POST /api/feedback
 *
 * Generic user-feedback endpoint. `kind` tells us whether this is a
 * feature suggestion or a bug report; the subject line + email heading
 * reflect it so the inbox is triageable at a glance.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const body = await request.json().catch(() => ({}));
  const { kind, title, description, attachment } = body as {
    kind?: FeedbackKind;
    title?: string;
    description?: string;
    attachment?: FeedbackAttachment;
  };

  const safeKind: FeedbackKind = kind === "bug" ? "bug" : "feature";

  if (!description?.trim()) {
    return NextResponse.json({ error: "Description is required" }, { status: 400 });
  }
  if (description.trim().length > 2000) {
    return NextResponse.json({ error: "Description too long" }, { status: 400 });
  }

  // Validate the attachment envelope before we hand bytes to Resend.
  let resendAttachments: { filename: string; content: string }[] | undefined;
  if (attachment) {
    if (
      typeof attachment.name !== "string" ||
      typeof attachment.type !== "string" ||
      typeof attachment.data !== "string"
    ) {
      return NextResponse.json({ error: "Invalid attachment" }, { status: 400 });
    }
    if (!ALLOWED_ATTACHMENT_TYPES.test(attachment.type)) {
      return NextResponse.json({ error: "Unsupported attachment type" }, { status: 400 });
    }
    // base64 length → raw bytes: every 4 chars ≈ 3 bytes (minus padding).
    const padding = (attachment.data.match(/=+$/) ?? [""])[0].length;
    const rawBytes = Math.floor((attachment.data.length * 3) / 4) - padding;
    if (rawBytes > MAX_ATTACHMENT_BYTES) {
      return NextResponse.json({ error: "Attachment too large" }, { status: 400 });
    }
    resendAttachments = [
      {
        filename: attachment.name.slice(0, 200) || "attachment",
        content: attachment.data,
      },
    ];
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

  const isBug = safeKind === "bug";
  const subjectPrefix = isBug ? "[Bug Report]" : "[Feature Request]";
  const heading = isBug ? "Bug Report" : "Feature Request";
  const bodyLabel = isBug ? "Details" : "Request";

  const html = `
    <h2 style="font-family:sans-serif;margin:0 0 16px">${heading}</h2>
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
        <td style="padding:6px 16px 6px 0;color:#6b7280;vertical-align:top">${bodyLabel}</td>
        <td style="padding:6px 0;color:#111827;white-space:pre-wrap">${description.trim()}</td>
      </tr>
    </table>
  `;

  const { error } = await resend.emails.send({
    from: "Tri-Star Pickleball <info@tristarpickleball.com>",
    to: "info@tristarpickleball.com",
    replyTo: playerEmail || undefined,
    subject: `${subjectPrefix} ${headline} // Tri-Star Pickleball`,
    html,
    attachments: resendAttachments,
  });

  if (error) {
    console.error("Feedback email failed:", error);
    return NextResponse.json({ error: "Failed to send" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
