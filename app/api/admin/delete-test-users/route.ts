import { createClient } from "@/lib/supabase/server";
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

  // Find all test profiles
  const { data: testProfiles } = await supabase
    .from("profiles")
    .select("id")
    .like("display_name", "[TEST]%");

  if (!testProfiles || testProfiles.length === 0) {
    return NextResponse.json({ message: "No test users found", deleted: 0 });
  }

  const ids = testProfiles.map((p) => p.id);

  // Delete registrations
  await supabase
    .from("registrations")
    .delete()
    .in("player_id", ids);

  // Delete group memberships
  await supabase
    .from("group_memberships")
    .delete()
    .in("player_id", ids);

  // Delete profiles
  const { error } = await supabase
    .from("profiles")
    .delete()
    .in("id", ids);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, deleted: ids.length });
}
