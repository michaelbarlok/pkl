import { createServiceClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const url = new URL(request.url);
  const querySheetId = url.searchParams.get("sheetId");
  const body = await request.json().catch(() => ({}));
  const sheetId = querySheetId || body.sheetId;

  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  if (!sheetId) {
    return NextResponse.json({ error: "sheetId is required" }, { status: 400 });
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY is not configured" }, { status: 500 });
  }
  const serviceClient = await createServiceClient();

  // Call the database function — everything happens in a single SQL transaction
  const { data, error } = await serviceClient.rpc("seed_test_users", {
    p_sheet_id: sheetId,
    p_admin_id: auth.profile.id,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
