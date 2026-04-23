import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getDivisionLabel } from "@/lib/divisions";
import { TournamentBracketView } from "@/components/tournament-bracket";
import type { PartnerMap } from "@/components/tournament-bracket";
import { LiveTournamentRealtime } from "./live-realtime";
import { NextUpQueue } from "./next-up-queue";
import { DivisionRulesCard } from "./division-rules-card";

export const dynamic = "force-dynamic";

/**
 * Player-facing live tournament view. Reached via the Play tab when
 * the viewer's division is currently active. Read-only — score entry
 * is organizer-only.
 *
 * Shows:
 *   1. Rules for their division (scores, format, tiebreaker stack).
 *   2. Bracket / pool standings (existing TournamentBracketView,
 *      canManage forced to false).
 *   3. Next 3 matches across all active divisions, live-updating.
 *
 * The LiveTournamentRealtime client component subscribes to changes
 * on tournament_matches + tournament_active_divisions so everything
 * re-renders without a manual refresh.
 */
export default async function TournamentLivePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: tournamentId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/tournaments/${tournamentId}/live`);

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, display_name")
    .eq("user_id", user.id)
    .single();
  if (!profile) notFound();

  const [{ data: tournament }, { data: registration }, { data: activeDivs }] =
    await Promise.all([
      supabase
        .from("tournaments")
        .select(
          "id, title, status, format, type, num_courts, score_to_win_pool, score_to_win_playoff, finals_best_of_3, division_settings"
        )
        .eq("id", tournamentId)
        .single(),
      supabase
        .from("tournament_registrations")
        .select("division, partner_id")
        .eq("tournament_id", tournamentId)
        .eq("player_id", profile.id)
        .neq("status", "withdrawn")
        .maybeSingle(),
      supabase
        .from("tournament_active_divisions")
        .select("division")
        .eq("tournament_id", tournamentId),
    ]);

  if (!tournament) notFound();
  if (!registration) notFound();

  const myDivision = registration.division as string;
  const activeDivisionSet = new Set(
    (activeDivs ?? []).map((r: any) => r.division as string)
  );

  // If the viewer's division isn't active, bounce them back to the
  // tournament detail page where they can at least see the bracket.
  if (!activeDivisionSet.has(myDivision)) {
    redirect(`/tournaments/${tournamentId}`);
  }

  // Bracket + partner info. We scope the bracket query to the
  // viewer's division only — they shouldn't see other divisions.
  const { data: matches } = await supabase
    .from("tournament_matches")
    .select(
      "*, player1:profiles!player1_id(id, display_name, avatar_url), player2:profiles!player2_id(id, display_name, avatar_url)"
    )
    .eq("tournament_id", tournamentId)
    .eq("division", myDivision)
    .order("round", { ascending: true })
    .order("match_number", { ascending: true });

  // Partner map for doubles labels.
  const partnerMap: PartnerMap = new Map();
  if (tournament.type === "doubles") {
    const { data: regs } = await supabase
      .from("tournament_registrations")
      .select("player_id, partner_id, partner:profiles!partner_id(display_name)")
      .eq("tournament_id", tournamentId)
      .eq("division", myDivision)
      .neq("status", "withdrawn");
    for (const r of (regs ?? []) as any[]) {
      if (r.player_id && r.partner_id) {
        partnerMap.set(r.player_id, r.partner?.display_name ?? "Partner");
      }
    }
  }

  return (
    <div className="space-y-5 pb-24 animate-fade-in">
      <div className="flex items-center gap-2 text-xs">
        <Link href={`/tournaments/${tournamentId}`} className="text-surface-muted hover:text-dark-200">
          ← Back to tournament
        </Link>
      </div>

      <header className="space-y-1">
        <h1 className="text-xl font-bold text-dark-100">{tournament.title}</h1>
        <p className="text-sm text-surface-muted">
          {getDivisionLabel(myDivision)}
          <span className="mx-2 text-surface-border">·</span>
          <span className="inline-flex items-center gap-1.5 text-brand-vivid">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-vivid animate-pulse" />
            Live
          </span>
        </p>
      </header>

      <DivisionRulesCard
        division={myDivision}
        format={tournament.format}
        scoreToWinPool={tournament.score_to_win_pool ?? undefined}
        scoreToWinPlayoff={tournament.score_to_win_playoff ?? undefined}
        finalsBestOf3={tournament.finals_best_of_3 ?? undefined}
        divisionSettings={(tournament as any).division_settings?.[myDivision] ?? null}
      />

      <TournamentBracketView
        matches={(matches ?? []) as any}
        format={tournament.format}
        canManage={false}
        tournamentId={tournamentId}
        division={myDivision}
        scoreToWinPool={tournament.score_to_win_pool ?? undefined}
        scoreToWinPlayoff={tournament.score_to_win_playoff ?? undefined}
        finalsBestOf3={tournament.finals_best_of_3 ?? undefined}
        partnerMap={partnerMap}
      />

      <NextUpQueue
        tournamentId={tournamentId}
        myPlayerId={profile.id}
        myDivision={myDivision}
      />

      <LiveTournamentRealtime tournamentId={tournamentId} />
    </div>
  );
}
