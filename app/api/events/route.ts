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

  const { Resend } = await import("resend");
  const resend = new Resend(apiKey);

  const { from, to, subject, email_id } = event.data;
  const recipient = to[0] ?? "info@tristarpickleball.com";
  let html: string | undefined;
  let text: string | undefined;

  // Fetch the full email content from Resend REST API using the email_id
  try {
    const res = await fetch(`https://api.resend.com/emails/${email_id}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (res.ok) {
      const json = await res.json() as { html?: string; text?: string };
      html = json.html ?? undefined;
      text = json.text ?? undefined;
    } else {
      console.warn("Resend email fetch failed:", res.status);
    }
  } catch (err) {
    console.warn("Could not fetch email body:", err);
  }

  const bodyText = text
    ? `--- Forwarded from ${from} to ${recipient} ---\n\n${text}`
    : `--- Forwarded from ${from} to ${recipient} ---`;

  try {
    await resend.emails.send(
      html
        ? {
            from: `Tri-Star Pickleball <info@tristarpickleball.com>`,
            to: forwardTo,
            replyTo: from,
            subject: `[INFO-TSP] ${subject}`,
            html,
            text: bodyText,
          }
        : {
            from: `Tri-Star Pickleball <info@tristarpickleball.com>`,
            to: forwardTo,
            replyTo: from,
            subject: `[INFO-TSP] ${subject}`,
            text: bodyText,
          }
    );
  } catch (err) {
    console.error("Failed to forward email:", err);
    return NextResponse.json({ error: "Forward failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
