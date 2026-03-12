import { createClient } from "@/lib/supabase/server";
import type { NotificationType } from "@/types/database";

interface NotifyParams {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  link?: string;
  groupId?: string;
  emailTemplate?: string;
  emailData?: Record<string, unknown>;
}

/**
 * Unified notification helper.
 * 1. Always writes an in-app notification row.
 * 2. Sends email via Resend if user prefers email and template exists.
 * 3. Sends SMS via Twilio if user prefers SMS and has a phone number.
 */
export async function notify({
  userId,
  type,
  title,
  body,
  link,
  groupId,
  emailTemplate,
  emailData,
}: NotifyParams): Promise<void> {
  const supabase = await createClient();

  // 1. Always write in-app notification
  await supabase.from("notifications").insert({
    user_id: userId,
    type,
    title,
    body,
    link,
    group_id: groupId ?? null,
  });

  // 2. Fetch user preferences
  const { data: profile } = await supabase
    .from("profiles")
    .select("email, phone, preferred_notify")
    .eq("id", userId)
    .single();

  if (!profile) return;

  const prefs: string[] = profile.preferred_notify ?? ["email"];

  // 3. Email via Resend
  if (prefs.includes("email") && emailTemplate && profile.email) {
    try {
      await sendEmail({
        to: profile.email,
        subject: title,
        template: emailTemplate,
        data: { ...emailData, title, body },
      });
    } catch (err) {
      console.error("Failed to send email notification:", err);
    }
  }

  // 4. SMS via Twilio (optional)
  if (prefs.includes("sms") && profile.phone) {
    try {
      await sendSMS({
        to: profile.phone,
        message: `${title}: ${body}`,
      });
    } catch (err) {
      console.error("Failed to send SMS notification:", err);
    }
  }
}

/**
 * Send bulk notifications to multiple users.
 */
export async function notifyMany(
  userIds: string[],
  params: Omit<NotifyParams, "userId">
): Promise<void> {
  await Promise.allSettled(
    userIds.map((userId) => notify({ ...params, userId }))
  );
}

// ============================================================
// Email (Resend)
// ============================================================

async function sendEmail({
  to,
  subject,
  template,
  data,
}: {
  to: string;
  subject: string;
  template: string;
  data: Record<string, unknown>;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;

  const { Resend } = await import("resend");
  const resend = new Resend(apiKey);

  // Dynamic import of React Email template
  let emailComponent;
  try {
    emailComponent = (await import(`@/emails/${template}`)).default;
  } catch {
    console.warn(`Email template not found: ${template}`);
    return;
  }

  await resend.emails.send({
    from: "PaddleUp Pickleball <noreply@athenspickleball.com>",
    to,
    subject,
    react: emailComponent(data),
  });
}

// ============================================================
// SMS (Twilio)
// ============================================================

async function sendSMS({
  to,
  message,
}: {
  to: string;
  message: string;
}): Promise<void> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_PHONE_NUMBER;

  if (!sid || !token || !from) return;

  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
  const auth = Buffer.from(`${sid}:${token}`).toString("base64");

  await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: to, From: from, Body: message }),
  });
}
