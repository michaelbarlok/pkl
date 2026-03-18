import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export type AuthResult = {
  user: { id: string };
  profile: { id: string; role: string };
  supabase: Awaited<ReturnType<typeof createClient>>;
};

/**
 * Get authenticated user and their profile.
 * Returns null if not authenticated.
 */
export async function getAuthUser(): Promise<AuthResult | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("user_id", user.id)
    .single();
  if (!profile) return null;

  return { user, profile, supabase };
}

/**
 * Require authenticated user, returning 401 response if not authenticated.
 */
export async function requireAuth(): Promise<AuthResult | NextResponse> {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return auth;
}

/**
 * Require admin role, returning 403 if not admin.
 */
export async function requireAdmin(): Promise<AuthResult | NextResponse> {
  const result = await requireAuth();
  if (result instanceof NextResponse) return result;
  if (result.profile.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return result;
}

/**
 * Check if user is admin of a specific group (either global admin or group-role admin).
 */
export async function isGroupAdmin(
  supabase: AuthResult["supabase"],
  profileId: string,
  groupId: string,
  globalRole: string
): Promise<boolean> {
  if (globalRole === "admin") return true;
  const { data: membership } = await supabase
    .from("group_memberships")
    .select("group_role")
    .eq("group_id", groupId)
    .eq("player_id", profileId)
    .maybeSingle();
  return membership?.group_role === "admin";
}
