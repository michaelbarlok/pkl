import { requireAuth } from "@/lib/auth";
import { NextResponse } from "next/server";

export async function GET() {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const { data, error } = await auth.supabase
    .from("notifications")
    .select("*")
    .eq("user_id", auth.profile.id)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
