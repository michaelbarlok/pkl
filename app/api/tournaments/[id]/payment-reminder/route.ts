import { requireAuth } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { isTestUser } from "@/lib/utils";
import { formatDate } from "@/lib/utils";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: tournamentId } = await params;

    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const admin = await createServiceClient();

    // Get tournament with payment info
    const { data: tournament } = await admin
      .from("tournaments")
      .select("title, start_date, entry_fee, payment_options, created_by")
      .eq("id", tournamentId)
      .single();

    if (!tournament) {
      return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
    }

    if (!tournament.entry_fee) {
      return NextResponse.json({ error: "Tournament has no entry fee" }, { status: 400 });
    }

    // Verify caller is an organizer (creator, co-organizer, or site admin)
    const callerProfileId = auth.profile.id;
    const isCreator = tournament.created_by === callerProfileId;
    const isSiteAdmin = auth.profile.role === "admin";

    if (!isCreator && !isSiteAdmin) {
      const { data: coOrg } = await admin
        .from("tournament_organizers")
        .select("profile_id")
        .eq("tournament_id", tournamentId)
        .eq("profile_id", callerProfileId)
        .single();

      if (!coOrg) {
        return NextResponse.json({ error: "Not authorized" }, { status: 403 });
      }
    }

    // Get all confirmed unpaid registrations with player emails
    const { data: registrations } = await admin
      .from("tournament_registrations")
      .select("id, player:profiles!player_id(id, display_name, email)")
      .eq("tournament_id", tournamentId)
      .eq("status", "confirmed")
      .eq("paid", false);

    if (!registrations || registrations.length === 0) {
      return NextResponse.json({ sent: 0 });
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Email service not configured" }, { status: 500 });
    }

    const { Resend } = await import("resend");
    const resend = new Resend(apiKey);

    const emailComponent = (await import("@/emails/TournamentPaymentReminder")).default;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
    const tournamentUrl = `${appUrl}/tournaments/${tournamentId}`;
    const paymentOptions = (tournament.payment_options as { method: string; detail: string }[]) ?? [];

    let sent = 0;

    for (const reg of registrations) {
      const player = reg.player as any;
      if (!player?.email || isTestUser(player.email, player.display_name)) continue;

      await resend.emails.send({
        from: "Tri-Star Pickleball <info@tristarpickleball.com>",
        to: player.email,
        subject: `Payment reminder — ${tournament.title}`,
        react: emailComponent({
          playerName: player.display_name ?? "Player",
          tournamentName: tournament.title,
          tournamentDate: formatDate(tournament.start_date),
          entryFee: tournament.entry_fee,
          paymentOptions,
          tournamentUrl,
        }),
      });

      sent++;
    }

    return NextResponse.json({ sent });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
