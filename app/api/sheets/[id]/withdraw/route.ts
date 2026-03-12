import { createClient, createServiceClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sheetId } = await params;

    // Verify the caller is authenticated
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Get the caller's profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (!profile) {
      return NextResponse.json(
        { error: "Profile not found" },
        { status: 404 }
      );
    }

    // Use service client to call RPC
    const serviceClient = await createServiceClient();

    const { error: rpcError } = await serviceClient.rpc(
      "withdraw_from_sheet",
      {
        p_sheet_id: sheetId,
        p_player_id: profile.id,
      }
    );

    if (rpcError) {
      return NextResponse.json({ error: rpcError.message }, { status: 400 });
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
