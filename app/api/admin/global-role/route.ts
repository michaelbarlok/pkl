import { createServiceClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const body = await request.json();
  const { playerId, role } = body;

  if (!playerId || !["admin", "player"].includes(role)) {
    return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
  }

  // Prevent demoting yourself
  if (playerId === auth.profile.id && role !== "admin") {
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
