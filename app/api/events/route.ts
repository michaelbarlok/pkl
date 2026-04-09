import { NextRequest, NextResponse } from "next/server";
import { Webhook } from "svix";

interface EmailReceivedEvent {
  type: "email.received";
  created_at: string;
  data: {
    email_id: string;
    created_at: string;
    from: string;
    to: string[];
    cc: string[];
    bcc: string[];
    subject: string;
    message_id: string;
    html?: string;
    text?: string;
    attachments: {
      id: string;
      filename: string;
      content_type: string;
      content_disposition: string;
      content_id?: string;
    }[];
  };
}

export async function POST(request: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    console.error("RESEND_WEBHOOK_SECRET not set");
    return NextResponse.json({ error: "Misconfigured" }, { status: 500 });
  }

  // Verify the webhook signature
  const payload = await request.text();
  const headers = {
    "svix-id": request.headers.get("svix-id") ?? "",
    "svix-timestamp": request.headers.get("svix-timestamp") ?? "",
    "svix-signature": request.headers.get("svix-signature") ?? "",
  };

  let event: EmailReceivedEvent;
  try {
    const wh = new Webhook(secret);
    event = wh.verify(payload, headers) as EmailReceivedEvent;
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type !== "email.received") {
    return NextResponse.json({});
  }

  const forwardTo = process.env.FORWARD_TO_EMAIL;
  if (!forwardTo) {
    console.error("FORWARD_TO_EMAIL not set");
    return NextResponse.json({ error: "Misconfigured" }, { status: 500 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("RESEND_API_KEY not set");
    return NextResponse.json({ error: "Misconfigured" }, { status: 500 });
  }

  const { from, to, subject, html, text } = event.data;
  const recipient = to[0] ?? "info@tristarpickleball.com";

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(apiKey);

    await resend.emails.send({
      from: `Tri-Star Pickleball <info@tristarpickleball.com>`,
      to: forwardTo,
      reply_to: from,
      subject: `[${recipient}] ${subject}`,
      html: html ?? undefined,
      text: text
        ? `--- Forwarded from ${from} to ${recipient} ---\n\n${text}`
        : undefined,
    });
  } catch (err) {
    console.error("Failed to forward email:", err);
    return NextResponse.json({ error: "Forward failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
