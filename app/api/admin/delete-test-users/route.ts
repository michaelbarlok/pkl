import { createClient, createServiceClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST() {
  const supabase = await createClient();

  // Verify admin
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("user_id", user.id)
    .single();

  if (!profile || profile.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Use service client for data mutations (bypasses RLS)
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY is not configured" }, { status: 500 });
  }
  const serviceClient = await createServiceClient();

  // Find all test profiles (with user_id for auth cleanup)
  const { data: testProfiles } = await serviceClient
    .from("profiles")
    .select("id, user_id")
    .like("display_name", "[TEST]%");

  if (!testProfiles || testProfiles.length === 0) {
    return NextResponse.json({ message: "No test users found", deleted: 0 });
  }

  const ids = testProfiles.map((p) => p.id);
  const authUserIds = testProfiles.map((p) => p.user_id).filter(Boolean);

  // Delete registrations
  await serviceClient
    .from("registrations")
    .delete()
    .in("player_id", ids);

  // Delete group memberships
  await serviceClient
    .from("group_memberships")
    .delete()
    .in("player_id", ids);

  // Delete profiles
  const { error } = await serviceClient
    .from("profiles")
    .delete()
    .in("id", ids);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Delete auth users
  for (const authId of authUserIds) {
    await serviceClient.auth.admin.deleteUser(authId);
  }

  return NextResponse.json({ success: true, deleted: ids.length });
}
