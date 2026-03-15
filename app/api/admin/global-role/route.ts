import { createClient, createServiceClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: callerProfile } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("user_id", user.id)
    .single();

  if (!callerProfile || callerProfile.role !== "admin") {
    return NextResponse.json({ error: "Forbidden — only global admins can change this role" }, { status: 403 });
  }

  const body = await request.json();
  const { playerId, role } = body;

  if (!playerId || !["admin", "player"].includes(role)) {
    return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
  }

  // Prevent demoting yourself
  if (playerId === callerProfile.id && role !== "admin") {
    return NextResponse.json(
      { error: "You cannot remove your own global admin role" },
      { status: 400 }
    );
  }

  const admin = await createServiceClient();

  const { error } = await admin
    .from("profiles")
    .update({ role })
    .eq("id", playerId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
