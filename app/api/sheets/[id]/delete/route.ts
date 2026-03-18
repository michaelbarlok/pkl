import { createServiceClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: sheetId } = await params;

  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const admin = await createServiceClient();

  // Delete all registrations for this sheet first
  await admin
    .from("registrations")
    .delete()
    .eq("sheet_id", sheetId);

  // Delete any sessions tied to this sheet
  const { data: sessions } = await admin
    .from("shootout_sessions")
    .select("id")
    .eq("sheet_id", sheetId);

  if (sessions && sessions.length > 0) {
    const sessionIds = sessions.map((s) => s.id);

    // Delete session participants and game results
    await admin
      .from("session_participants")
      .delete()
      .in("session_id", sessionIds);

    await admin
      .from("game_results")
      .delete()
      .in("session_id", sessionIds);

    await admin
      .from("shootout_sessions")
      .delete()
      .eq("sheet_id", sheetId);
  }

  // Delete the sheet itself
  const { error } = await admin
    .from("signup_sheets")
    .delete()
    .eq("id", sheetId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidatePath("/sheets");
  revalidatePath("/admin/sheets");

  return NextResponse.json({ success: true });
}
