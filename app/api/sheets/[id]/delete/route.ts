import { createServiceClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { recalculateAllWinPcts } from "@/lib/queries/rankings";
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

  // Capture group_id before deleting so we can recalculate win% afterwards
  const { data: sheet } = await admin
    .from("signup_sheets")
    .select("group_id")
    .eq("id", sheetId)
    .single();

  const groupId = sheet?.group_id ?? null;

  // Delete registrations (no cascade from signup_sheets)
  await admin
    .from("registrations")
    .delete()
    .eq("sheet_id", sheetId);

  // Delete the sheet — cascades to shootout_sessions → session_participants
  // and game_results (via FK added in migration 068)
  const { error } = await admin
    .from("signup_sheets")
    .delete()
    .eq("id", sheetId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Recalculate win% for all group members so stored values reflect the deletion
  if (groupId) {
    recalculateAllWinPcts(groupId, admin).catch((e) =>
      console.error("win% recalc after sheet delete failed:", e)
    );
  }

  revalidatePath("/sheets");
  revalidatePath("/admin/sheets");

  return NextResponse.json({ success: true });
}
