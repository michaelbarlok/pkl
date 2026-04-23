import type React from "react";
import { createServiceClient } from "@/lib/supabase/server";
import { sendPushNotification } from "@/lib/push";
import { isTestUser } from "@/lib/utils";
import type { NotificationType } from "@/types/database";

interface NotifyParams {
  profileId: string;
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
  profileId,
  type,
  title,
  body,
  link,
  groupId,
  emailTemplate,
  emailData,
}: NotifyParams): Promise<void> {
  const supabase = await createServiceClient();

  // 1. Fetch user preferences first so we can respect "off" before writing in-app
  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("email, phone, preferred_notify, notification_preferences, display_name")
    .eq("id", profileId)
    .single();

  if (!profile) {
    console.error("Profile not found for notification:", profileId, profileErr?.message);
    return;
  }

  const prefs: string[] = profile.preferred_notify ?? ["email"];
  const rawTypePrefs =
    (profile.notification_preferences as Record<string, unknown> | null) ?? {};
  const rawTypePref = rawTypePrefs[type];

  // Per-type prefs: accept both the new array shape (["email","push"]) and
  // the legacy string shape ("email"|"push"|"off") for rows not touched by
  // the 077 backfill. An empty array means "off" for this type.
  const typeChannels: Set<"email" | "push"> | null = (() => {
    if (rawTypePref === undefined || rawTypePref === null) return null;
    if (Array.isArray(rawTypePref)) {
      return new Set(rawTypePref.filter((c): c is "email" | "push" => c === "email" || c === "push"));
    }
    if (typeof rawTypePref === "string") {
      if (rawTypePref === "off") return new Set();
      if (rawTypePref === "email" || rawTypePref === "push") return new Set([rawTypePref]);
    }
    return null;
  })();

  // If the user explicitly turned this notification type off entirely, do nothing
  if (typeChannels && typeChannels.size === 0) return;

  // 2. Write in-app notification
  try {
    const { error: insertErr } = await supabase.from("notifications").insert({
      user_id: profileId,
      type,
      title,
      body,
      link,
      group_id: groupId ?? null,
    });
    if (insertErr) {
      console.error("Failed to insert notification:", insertErr.message);
    }
  } catch (e) {
    console.error("Notification insert threw:", e);
  }

  // Per-type prefs take priority; missing entries fall back to the global
  // preferred_notify list. Both channels can be active simultaneously.
  const shouldEmail = typeChannels ? typeChannels.has("email") : prefs.includes("email");
  const shouldPush = typeChannels ? typeChannels.has("push") : prefs.includes("push");

  // 3. Fire email, SMS, and push in parallel. Previously these were
  // awaited one after the other, so a push was delayed by however long
  // Resend took (~1-3s) before the browser push service even saw it —
  // users on push-only notifications experienced a 30s+ perceived lag
  // compared to email. Each channel is independent and failures are
  // already handled locally, so there's no reason to serialize.
  const emailPromise =
    shouldEmail && emailTemplate && profile.email && !isTestUser(profile.email, profile.display_name)
      ? sendEmail({
          to: profile.email,
          subject: title,
          template: emailTemplate,
          data: { ...emailData, title, body },
        }).catch((err) => {
          console.error("Failed to send email notification:", err);
        })
      : null;

  const smsPromise =
    prefs.includes("sms") && profile.phone
      ? sendSMS({
          to: profile.phone,
          message: `${title}: ${body}`,
        }).catch((err) => {
          console.error("Failed to send SMS notification:", err);
        })
      : null;

  const pushPromise = shouldPush
    ? sendPushNotification(supabase, profileId, {
        title,
        body,
        link,
        tag: type,
      }).catch((err) => {
        console.error("Failed to send push notification:", err);
      })
    : null;

  await Promise.allSettled([emailPromise, smsPromise, pushPromise].filter((p) => p !== null));
}

/**
 * Send bulk notifications to multiple users.
 * Processes in batches of 10 with a short delay between batches
 * to avoid overwhelming Resend/Twilio rate limits.
 */
export async function notifyMany(
  profileIds: string[],
  params: Omit<NotifyParams, "profileId">
): Promise<void> {
  const BATCH_SIZE = 10;
  let totalFailures = 0;

  for (let i = 0; i < profileIds.length; i += BATCH_SIZE) {
    const batch = profileIds.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map((profileId) => notify({ ...params, profileId }))
    );
    const failures = results.filter((r) => r.status === "rejected");
    totalFailures += failures.length;

    // Delay between batches to respect rate limits (skip after last batch)
    if (i + BATCH_SIZE < profileIds.length) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  if (totalFailures > 0) {
    console.error(`notifyMany: ${totalFailures}/${profileIds.length} failed`);
  }
}

// ============================================================
// Email (Resend)
// ============================================================

// Static template map — dynamic import(`@/emails/${name}`) doesn't work
// with Next.js path aliases at runtime, so we map templates explicitly.
const EMAIL_TEMPLATES: Record<string, () => Promise<{ default: (props: any) => React.ReactElement }>> = {
  NewSheet: () => import("@/emails/NewSheet"),
  SheetCancelled: () => import("@/emails/SheetCancelled"),
  SheetUpdated: () => import("@/emails/SheetUpdated"),
  WaitlistPromoted: () => import("@/emails/WaitlistPromoted"),
  BumpedToWaitlist: () => import("@/emails/BumpedToWaitlist"),
  SignupReminder: () => import("@/emails/SignupReminder"),
  WithdrawReminder: () => import("@/emails/WithdrawReminder"),
  SessionStarting: () => import("@/emails/SessionStarting"),
  ContactGroupAdmins: () => import("@/emails/ContactGroupAdmins"),
  MemberInvite: () => import("@/emails/MemberInvite"),
  ForumReply: () => import("@/emails/ForumReply"),
  ForumMention: () => import("@/emails/ForumMention"),
  PoolAssigned: () => import("@/emails/PoolAssigned"),
  StepChanged: () => import("@/emails/StepChanged"),
  TournamentWaitlistPromoted: () => import("@/emails/TournamentWaitlistPromoted"),
  TournamentRegistered: () => import("@/emails/TournamentRegistered"),
  TournamentWithdrawal: () => import("@/emails/TournamentWithdrawal"),
  BadgeEarned: () => import("@/emails/BadgeEarned"),
  SessionRecap: () => import("@/emails/SessionRecap"),
  FreePlayRecap: () => import("@/emails/FreePlayRecap"),
  GroupAnnouncement: () => import("@/emails/GroupAnnouncement"),
  TournamentRecap: () => import("@/emails/TournamentRecap"),
  TournamentPartnerRequest: () => import("@/emails/TournamentPartnerRequest"),
  TournamentPartnerAccepted: () => import("@/emails/TournamentPartnerAccepted"),
  TournamentPartnerDeclined: () => import("@/emails/TournamentPartnerDeclined"),
};

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
  if (!apiKey) {
    console.warn("RESEND_API_KEY not set, skipping email");
    return;
  }

  const { Resend } = await import("resend");
  const resend = new Resend(apiKey);

  const loader = EMAIL_TEMPLATES[template];
  if (!loader) {
    console.warn(`Email template not found: ${template}`);
    return;
  }

  const emailComponent = (await loader()).default;

  await resend.emails.send({
    from: "Tri-Star Pickleball <info@tristarpickleball.com>",
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
