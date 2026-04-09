import { requireAuth } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { isTestUser } from "@/lib/utils";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: tournamentId } = await params;

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    // Need extra profile fields for email
    const { data: senderProfile } = await auth.supabase
      .from("profiles")
      .select("id, display_name, email")
      .eq("id", auth.profile.id)
      .single();

    if (!senderProfile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    const body = await request.json();
    const message = body?.message?.trim();
    if (!message) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    const admin = await createServiceClient();

    // Get the tournament
    const { data: tournament } = await admin
      .from("tournaments")
      .select("title, created_by")
      .eq("id", tournamentId)
      .single();

    if (!tournament) {
      return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
    }

    // Get co-organizers
    const { data: coOrgs } = await admin
      .from("tournament_organizers")
      .select("profile_id")
      .eq("tournament_id", tournamentId);

    const coOrgIds = (coOrgs ?? []).map((o) => o.profile_id);

    // Combine creator + co-organizers, deduplicate
    const allOrganizerIds = [...new Set([tournament.created_by, ...coOrgIds])];

    // Fetch organizer emails
    const { data: orgProfiles } = await admin
      .from("profiles")
      .select("email, display_name")
      .in("id", allOrganizerIds);

    const organizerEmails = (orgProfiles ?? [])
      .filter((p) => p.email && !isTestUser(p.email, p.display_name))
      .map((p) => p.email);

    if (organizerEmails.length === 0) {
      return NextResponse.json({ error: "No organizer emails found" }, { status: 404 });
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Email service not configured" }, { status: 500 });
    }

    const { Resend } = await import("resend");
    const resend = new Resend(apiKey);

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";

    const emailComponent = (await import("@/emails/ContactTournamentOrganizers")).default;

    await resend.emails.send({
      from: "Tri-Star Pickleball <info@tristarpickleball.com>",
      to: organizerEmails,
      subject: `Message from ${senderProfile.display_name} about ${tournament.title}`,
      replyTo: senderProfile.email,
      react: emailComponent({
        senderName: senderProfile.display_name,
        tournamentName: tournament.title,
        message,
        tournamentUrl: `${appUrl}/tournaments/${tournamentId}`,
      }),
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
