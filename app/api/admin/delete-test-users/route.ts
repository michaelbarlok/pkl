import { createServiceClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { NextResponse } from "next/server";

export async function POST() {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY is not configured" }, { status: 500 });
  }
  const serviceClient = await createServiceClient();

  // Call the database function — everything happens in a single SQL transaction
  const { data, error } = await serviceClient.rpc("delete_test_users");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
