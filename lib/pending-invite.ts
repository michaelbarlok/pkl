import type { createServiceClient } from "@/lib/supabase/server";

type ServiceClient = Awaited<ReturnType<typeof createServiceClient>>;

/**
 * Look up a pending invite by email and mark it consumed.
 *
 * Called from the profile-creation path (email/password verify, OAuth
 * callback, and the /api/register legacy endpoint) to apply admin-set
 * phone / skill_level to the new profile and prevent the same invite
 * row from being reused.
 *
 * Returns the prefilled fields, or null if no matching unused invite.
 */
export async function consumePendingInvite(
  service: ServiceClient,
  email: string,
): Promise<{ phone?: string; skill_level?: number } | null> {
  const { data } = await service
    .from("pending_invites")
    .select("id, phone, skill_level")
    .ilike("email", email)
    .is("used_at", null)
    .order("invited_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;

  await service
    .from("pending_invites")
    .update({ used_at: new Date().toISOString() })
    .eq("id", data.id);

  return {
    phone: data.phone ?? undefined,
    skill_level: data.skill_level ?? undefined,
  };
}
