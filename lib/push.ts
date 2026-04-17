/**
 * Server-side Web Push notification sender.
 *
 * Uses the `web-push` library with VAPID keys to send push notifications
 * to subscribed browsers/devices. Subscriptions are stored in Supabase.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

interface PushPayload {
  title: string;
  body: string;
  link?: string;
  tag?: string;
}

/**
 * Send a push notification to all subscriptions for a given profile.
 * Automatically removes expired/invalid subscriptions.
 */
export async function sendPushNotification(
  supabase: SupabaseClient,
  profileId: string,
  payload: PushPayload
): Promise<void> {
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
  const vapidSubject = process.env.VAPID_SUBJECT ?? "mailto:info@tristarpickleball.com";

  if (!vapidPublicKey || !vapidPrivateKey) {
    console.warn("VAPID keys not set, skipping push notification");
    return;
  }

  // Fetch all push subscriptions for this user
  const { data: subscriptions } = await supabase
    .from("push_subscriptions")
    .select("id, subscription")
    .eq("profile_id", profileId);

  if (!subscriptions || subscriptions.length === 0) return;

  const webpush = await import("web-push");
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

  const expiredIds: string[] = [];

  await Promise.allSettled(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          sub.subscription as any,
          JSON.stringify(payload),
          {
            urgency: "high",   // skip battery-saving delivery delays on Android/iOS
            TTL: 3600,         // expire after 1 hour instead of 4-week default
            timeout: 10000,    // don't hang indefinitely on a slow push endpoint
          }
        );
      } catch (err: any) {
        // 410 Gone or 404 = subscription expired, clean it up
        if (err?.statusCode === 410 || err?.statusCode === 404) {
          expiredIds.push(sub.id);
        } else {
          console.error("Push send failed:", err?.statusCode, err?.message);
        }
      }
    })
  );

  // Clean up expired subscriptions
  if (expiredIds.length > 0) {
    await supabase.from("push_subscriptions").delete().in("id", expiredIds);
  }
}
