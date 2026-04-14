import { requireAdmin } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { sendInviteEmail } from "@/app/api/admin/invite/send-email";
import { NextRequest, NextResponse } from "next/server";

interface MemberRow {
  firstName: string;
  lastName: string;
  email: string;
  gender?: string;
  phone?: string;
  dateOfBirth?: string;
  selfRating?: number;
}

interface ImportResult {
  email: string;
  displayName: string;
  status: "invited" | "already_member" | "already_invited" | "error";
  error?: string;
}

/**
 * POST /api/admin/import-members
 *
 * Body: { members: MemberRow[], message?: string }
 *
 * Requires global admin role.
 * For each member:
 *   1. Check if they already have a profile (skip with "already_member")
 *   2. Upsert pending_invite row
 *   3. Send invite email
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin();
    if (auth instanceof NextResponse) return auth;

    const body = await request.json();
    const { members, message } = body as {
      members?: MemberRow[];
      message?: string;
    };

    if (!Array.isArray(members) || members.length === 0) {
      return NextResponse.json(
        { error: "members array is required and must not be empty" },
        { status: 400 }
      );
    }

    const serviceClient = await createServiceClient();
    const results: ImportResult[] = [];

    for (const member of members) {
      const email = member.email?.trim().toLowerCase();
      if (!email) {
        results.push({ email: "", displayName: "", status: "error", error: "Missing email" });
        continue;
      }

      const firstName = member.firstName?.trim() ?? "";
      const lastName = member.lastName?.trim() ?? "";
      const displayName = [firstName, lastName].filter(Boolean).join(" ") || email;

      // Check if profile already exists
      const { data: existingProfile } = await serviceClient
        .from("profiles")
        .select("id")
        .ilike("email", email)
        .maybeSingle();

      if (existingProfile) {
        results.push({ email, displayName, status: "already_member" });
        continue;
      }

      // Upsert pending_invite (by email — latest invite wins)
      const { error: upsertError } = await serviceClient
        .from("pending_invites")
        .upsert(
          {
            email,
            display_name: displayName,
            first_name: firstName || null,
            last_name: lastName || null,
            phone: member.phone?.trim() || null,
            skill_level: member.selfRating ?? null,
            gender: member.gender?.trim() || null,
            date_of_birth: member.dateOfBirth?.trim() || null,
            invited_by: auth.profile.id,
            invited_at: new Date().toISOString(),
            message: message?.trim() || null,
            used_at: null,
          },
          { onConflict: "email", ignoreDuplicates: false }
        );

      if (upsertError) {
        results.push({ email, displayName, status: "error", error: upsertError.message });
        continue;
      }

      // Send invite email
      try {
        await sendInviteEmail(email, displayName, message?.trim() || undefined);
        results.push({ email, displayName, status: "invited" });
      } catch (emailError) {
        results.push({
          email,
          displayName,
          status: "error",
          error: emailError instanceof Error ? emailError.message : "Failed to send email",
        });
      }
    }

    const invited = results.filter((r) => r.status === "invited").length;
    const skipped = results.filter((r) => r.status === "already_member" || r.status === "already_invited").length;
    const errors = results.filter((r) => r.status === "error").length;

    return NextResponse.json({ results, invited, skipped, errors }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
