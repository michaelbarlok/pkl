import type { User } from "@supabase/supabase-js";
import type { createServiceClient } from "@/lib/supabase/server";
import { consumePendingInvite } from "@/lib/pending-invite";
import { claimPendingMemberships } from "@/lib/pending-memberships";
import { sendWelcomeEmail } from "@/lib/send-welcome-email";

type ServiceClient = Awaited<ReturnType<typeof createServiceClient>>;

interface ProfileRow {
  id: string;
  [key: string]: unknown;
}

/**
 * Single source of truth for "this auth user must have a profile row."
 *
 * Called from four places that all need the same outcome:
 *   - /auth/confirm  (email/password signup, after verifyOtp)
 *   - /auth/callback (Google OAuth, after exchangeCodeForSession)
 *   - /api/register  (legacy direct-call path, kept for compatibility)
 *   - /(app)/layout.tsx (last-resort fallback on every page load)
 *
 * The first three are the "first-class" creation points; the layout
 * fallback exists so a tab killed mid-flow still ends up with a profile
 * on the user's next visit. Because all four converge here, the welcome
 * email and pending-invite consumption happen exactly once — when the
 * row is actually inserted.
 *
 * Concurrency: the upsert uses ignoreDuplicates so two simultaneous
 * callers don't both fire welcome emails. Whichever insert lands first
 * "owns" the create; the other refetches and returns the existing row
 * with created=false.
 */
export async function ensureProfile(
  service: ServiceClient,
  user: User,
): Promise<{ profile: ProfileRow; created: boolean } | null> {
  // Fast path: profile already there.
  const { data: existing } = await service
    .from("profiles")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();
  if (existing) return { profile: existing as ProfileRow, created: false };

  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const metaFull =
    (meta.full_name as string | undefined) || (meta.name as string | undefined);
  const metaFirst = meta.first_name as string | undefined;
  const metaLast = meta.last_name as string | undefined;
  const metaGiven = meta.given_name as string | undefined;
  const metaFamily = meta.family_name as string | undefined;
  const metaAvatar =
    (meta.avatar_url as string | undefined) || (meta.picture as string | undefined);

  // Display name priority:
  //   1. explicit metadata set by our register form
  //   2. Google OAuth-supplied full_name / name
  //   3. email prefix (placeholder; LastNameNudge catches the missing surname)
  const fullName = metaFull || user.email?.split("@")[0] || "Player";
  const firstName =
    metaFirst ||
    metaGiven ||
    (fullName.includes(" ") ? fullName.slice(0, fullName.indexOf(" ")).trim() : fullName);
  const lastName =
    metaLast ||
    metaFamily ||
    (fullName.includes(" ") ? fullName.slice(fullName.indexOf(" ") + 1).trim() : "");

  const email = user.email ?? "";

  // Apply admin-set prefill (phone, skill_level) and burn the invite.
  const pendingData = email ? await consumePendingInvite(service, email) : null;

  // ignoreDuplicates: a concurrent caller that already inserted will
  // "win" and we'll get back zero rows — that's our signal to refetch
  // instead of re-firing the welcome email.
  const { data: insertedRows } = await service
    .from("profiles")
    .upsert(
      {
        user_id: user.id,
        full_name: fullName,
        display_name: fullName,
        first_name: firstName || null,
        last_name: lastName || null,
        email,
        role: "player",
        member_since: new Date().toISOString(),
        preferred_notify: ["email"],
        ...(metaAvatar ? { avatar_url: metaAvatar } : {}),
        ...(pendingData?.phone ? { phone: pendingData.phone } : {}),
        ...(pendingData?.skill_level != null
          ? { skill_level: pendingData.skill_level }
          : {}),
      },
      { onConflict: "user_id", ignoreDuplicates: true },
    )
    .select("*");

  const inserted = (insertedRows ?? [])[0] as ProfileRow | undefined;

  if (inserted) {
    // We won the create race — fire the one-shot side effects.
    if (email) {
      claimPendingMemberships(service, inserted.id, fullName, email).catch(() => {});
      sendWelcomeEmail(email, fullName).catch(() => {});
    }
    return { profile: inserted, created: true };
  }

  // Concurrent caller beat us. Fetch the row they inserted.
  const { data: existingAfter } = await service
    .from("profiles")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();
  return existingAfter
    ? { profile: existingAfter as ProfileRow, created: false }
    : null;
}
