import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: registrationId } = await params;
  const supabase = await createClient();

  // Verify admin auth
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("user_id", user.id)
    .single();

  if (!profile || profile.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Parse body
  const body = await request.json();
  const { priority } = body;

  if (!priority || !["high", "normal", "low"].includes(priority)) {
    return NextResponse.json(
      { error: "Invalid priority. Must be high, normal, or low." },
      { status: 400 }
    );
  }

  // Update registration priority
  const { data: registration, error } = await supabase
    .from("registrations")
    .update({ priority })
    .eq("id", registrationId)
    .select("id, sheet_id, priority")
    .single();

  if (error || !registration) {
    return NextResponse.json(
      { error: error?.message ?? "Registration not found" },
      { status: 404 }
    );
  }

  revalidatePath(`/sheets/${registration.sheet_id}`);
  revalidatePath("/sheets");

  return NextResponse.json({ registration });
}
