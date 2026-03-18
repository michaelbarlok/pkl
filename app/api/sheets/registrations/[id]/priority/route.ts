import { requireAdmin } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: registrationId } = await params;

  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

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
  const { data: registration, error } = await auth.supabase
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
