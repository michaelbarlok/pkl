import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getDivisionLabel } from "@/lib/divisions";
import { TournamentBracketView } from "@/components/tournament-bracket";
import type { PartnerMap } from "@/components/tournament-bracket";
import { CollapsibleCard } from "../collapsible-card";
import { LiveTournamentRealtime } from "./live-realtime";
import { MyCourtCard } from "./my-court-card";
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
      // `.or` so we find the registration whether the viewer is the
      // team's primary (player_id) or the partner that got added via
      // the Ask-to-Partner flow (partner_id).
      supabase
        .from("tournament_registrations")
        .select("division, player_id, partner_id")
        .eq("tournament_id", tournamentId)
        .or(`player_id.eq.${profile.id},partner_id.eq.${profile.id}`)
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
  // The team's "primary" — what tournament_matches.player1_id /
  // player2_id reference. Whether the viewer is the registration's
  // player_id or the partner_id, the primary is the row's player_id.
  const teamPrimaryId = registration.player_id as string;
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

  // Find the viewer's currently-assigned court (if any). Their team
  // is on court when a pending match has them as player1 or player2
  // and court_number is set. Partner display name is pulled from the
  // partnerMap below; opponent label combines the other side's
  // primary + partner.
  const myOnCourtMatch = (matches ?? []).find(
    (m: any) =>
      m.status === "pending" &&
      m.court_number != null &&
      (m.player1_id === teamPrimaryId || m.player2_id === teamPrimaryId)
  ) as any;

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

  // Build the hero-card payload from the on-court match. We figure
  // out which side of the match is "us", then derive the opponent
  // string and the viewer's partner display name.
  let myCourtCardData:
    | {
        id: string;
        court_number: number;
        division: string | null;
        round: number;
        bracket: string;
        partner_name: string | null;
        opponent_team: string | null;
      }
    | null = null;
  if (myOnCourtMatch) {
    const meIsP1 = myOnCourtMatch.player1_id === teamPrimaryId;
    const myPrimaryName = meIsP1
      ? myOnCourtMatch.player1?.display_name
      : myOnCourtMatch.player2?.display_name;
    const opponentPrimaryName = meIsP1
      ? myOnCourtMatch.player2?.display_name ?? "TBD"
      : myOnCourtMatch.player1?.display_name ?? "TBD";
    const opponentPrimaryId = meIsP1
      ? myOnCourtMatch.player2_id
      : myOnCourtMatch.player1_id;
    const opponentPartnerName = opponentPrimaryId
      ? partnerMap.get(opponentPrimaryId) ?? null
      : null;
    // Display the viewer's partner (the OTHER member of their team)
    // — which is whoever is in partnerMap for our team's primary,
    // unless the viewer themselves is that partner. Compare against
    // profile.display_name to figure out which case we're in.
    const partnerFromMap = partnerMap.get(teamPrimaryId) ?? null;
    const partnerName =
      partnerFromMap && partnerFromMap !== profile.display_name
        ? partnerFromMap
        : myPrimaryName && myPrimaryName !== profile.display_name
          ? myPrimaryName
          : null;

    myCourtCardData = {
      id: myOnCourtMatch.id,
      court_number: myOnCourtMatch.court_number,
      division: myOnCourtMatch.division ?? null,
      round: myOnCourtMatch.round,
      bracket: myOnCourtMatch.bracket,
      partner_name: partnerName,
      opponent_team: opponentPartnerName
        ? `${opponentPrimaryName} / ${opponentPartnerName}`
        : opponentPrimaryName,
    };
  }

  // Queue position for the collapsed "Match queue" card subtitle so
  // players see their wait time even before they expand the list.
  const { data: queueRowsRaw } = await supabase
    .from("tournament_matches")
    .select("player1_id, player2_id, division")
    .eq("tournament_id", tournamentId)
    .is("court_number", null)
    .eq("status", "pending")
    .not("queue_entered_at", "is", null)
    .order("queue_entered_at", { ascending: true });
  const queueRows = (queueRowsRaw ?? []).filter(
    (m: any) => m.division && activeDivisionSet.has(m.division)
  );
  const myQueueIdx = queueRows.findIndex(
    (m: any) => m.player1_id === teamPrimaryId || m.player2_id === teamPrimaryId
  );
  const queueSubtitle =
    myQueueIdx >= 0
      ? `You're ${ordinal(myQueueIdx + 1)} in line of ${queueRows.length}`
      : queueRows.length > 0
        ? `${queueRows.length} waiting`
        : "Empty";

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

      <MyCourtCard
        match={myCourtCardData}
        tournamentId={tournamentId}
        numCourts={tournament.num_courts ?? null}
      />

      {/* Rules — collapsed by default during live play. The rulebook
          doesn't change once the event is underway, so it's off the
          screen until the player wants to double-check scoring or
          tiebreakers. */}
      <CollapsibleCard
        title={`${getDivisionLabel(myDivision)} — Rules`}
        subtitle="Scoring, format, and tiebreakers"
        defaultOpen={false}
      >
        <DivisionRulesCard
          division={myDivision}
          format={tournament.format}
          scoreToWinPool={tournament.score_to_win_pool ?? undefined}
          scoreToWinPlayoff={tournament.score_to_win_playoff ?? undefined}
          finalsBestOf3={tournament.finals_best_of_3 ?? undefined}
          divisionSettings={(tournament as any).division_settings?.[myDivision] ?? null}
          embedded
        />
      </CollapsibleCard>

      {/* Match queue — collapsed by default, but the card subtitle
          shows queue position even collapsed so the player sees how
          far away their match is at a glance. Expand for the full
          FIFO list with highlighted self-row. */}
      <CollapsibleCard
        title="Match queue"
        subtitle={queueSubtitle}
        defaultOpen={false}
      >
        <NextUpQueue
          tournamentId={tournamentId}
          myTeamPrimaryId={teamPrimaryId}
          myDivision={myDivision}
          embedded
        />
      </CollapsibleCard>

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

      <LiveTournamentRealtime tournamentId={tournamentId} />
    </div>
  );
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}
