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
import { OtherPoolsViewer } from "./other-pools-viewer";

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

  const [{ data: tournament }, { data: regRows }, { data: activeDivs }] =
    await Promise.all([
      supabase
        .from("tournaments")
        .select(
          "id, title, status, format, type, num_courts, score_to_win_pool, score_to_win_playoff, finals_best_of_3, win_by_2, division_settings"
        )
        .eq("id", tournamentId)
        .single(),
      // `.or` so we find the registration whether the viewer is the
      // team's primary (player_id) or the partner that got added via
      // the Ask-to-Partner flow (partner_id). With multi-division
      // support a player may have multiple rows here (Men's + Mixed)
      // so we fetch all and pick the active-division one below —
      // .maybeSingle() would error on >1 row.
      supabase
        .from("tournament_registrations")
        .select("division, player_id, partner_id")
        .eq("tournament_id", tournamentId)
        .or(`player_id.eq.${profile.id},partner_id.eq.${profile.id}`)
        .neq("status", "withdrawn"),
      supabase
        .from("tournament_active_divisions")
        .select("division")
        .eq("tournament_id", tournamentId),
    ]);

  if (!tournament) notFound();
  const allMyRegs = (regRows ?? []) as {
    division: string;
    player_id: string;
    partner_id: string | null;
  }[];
  if (allMyRegs.length === 0) notFound();

  const activeDivisionSet = new Set(
    (activeDivs ?? []).map((r: any) => r.division as string)
  );

  // When the viewer has multiple registrations in the same tournament
  // (Men's + Mixed) and more than one of those divisions is in the
  // active set, picking the first match by row order can land them on
  // the wrong bracket — e.g. Men's wraps up but the organizer leaves
  // it in tournament_active_divisions while activating Mixed. To stay
  // on the bracket the player can actually act on, prefer the one
  // where their team has at least one PENDING match. Falls back to
  // any active reg, then to the first reg overall.
  const teamPrimaries = Array.from(new Set(allMyRegs.map((r) => r.player_id)));
  const { data: myPending } =
    teamPrimaries.length > 0
      ? await supabase
          .from("tournament_matches")
          .select("division, player1_id, player2_id")
          .eq("tournament_id", tournamentId)
          .eq("status", "pending")
          .or(
            teamPrimaries
              .flatMap((id) => [`player1_id.eq.${id}`, `player2_id.eq.${id}`])
              .join(",")
          )
      : { data: [] as { division: string | null; player1_id: string | null; player2_id: string | null }[] };
  const divisionsWithMyPending = new Set(
    (myPending ?? [])
      .map((m: any) => m.division as string | null)
      .filter((d): d is string => !!d)
  );

  const liveReg =
    allMyRegs.find(
      (r) => activeDivisionSet.has(r.division) && divisionsWithMyPending.has(r.division)
    ) ??
    allMyRegs.find((r) => activeDivisionSet.has(r.division)) ??
    allMyRegs[0];
  const myDivision = liveReg.division;
  // The team's "primary" — what tournament_matches.player1_id /
  // player2_id reference. Whether the viewer is the registration's
  // player_id or the partner_id, the primary is the row's player_id.
  const teamPrimaryId = liveReg.player_id;

  // If the viewer's division isn't active, bounce them back to the
  // tournament detail page where they can at least see the bracket.
  if (!activeDivisionSet.has(myDivision)) {
    redirect(`/tournaments/${tournamentId}`);
  }

  // Court ranges scope the player's queue. If the tournament has
  // ranges defined and the viewer's division is in range R, the
  // Match Queue should show only matches in R's divisions —
  // matches outside their range queue for different courts and
  // aren't relevant to the player's wait time. Without ranges, the
  // queue stays global.
  const { data: courtRangeRows } = await supabase
    .from("tournament_court_ranges")
    .select("id, label, court_start, court_end, divisions")
    .eq("tournament_id", tournamentId)
    .order("position", { ascending: true });
  const courtRanges = (courtRangeRows ?? []) as {
    id: string;
    label: string;
    court_start: number;
    court_end: number;
    divisions: string[];
  }[];
  let queueScopeDivisions: string[] | null;
  // Short, viewer-facing label for the queue scope so the Match
  // Queue card can say "your range" instead of looking like the
  // global queue. NULL when no scoping applies (legacy / no court
  // ranges defined) — UI falls back to a plain "Match queue" title.
  let queueScopeLabel: string | null = null;
  let myRangeId: string | null = null;
  if (courtRanges.length === 0) {
    queueScopeDivisions = null;
  } else {
    const myRange = courtRanges.find((r) => r.divisions.includes(myDivision));
    if (myRange) {
      queueScopeDivisions = myRange.divisions;
      queueScopeLabel = `${myRange.label} · Courts ${myRange.court_start}–${myRange.court_end}`;
      myRangeId = myRange.id;
    } else {
      // Division isn't pinned to any range — share the queue with
      // every other unranged division (matches eligible for the
      // tournament's "leftover" courts).
      const ranged = new Set<string>();
      for (const r of courtRanges) for (const d of r.divisions) ranged.add(d);
      queueScopeDivisions = Array.from(activeDivisionSet).filter(
        (d) => !ranged.has(d)
      );
      queueScopeLabel = "Unassigned divisions";
    }
  }
  const scopeDivisionSet = queueScopeDivisions
    ? new Set(queueScopeDivisions)
    : null;

  // Pull matches for every active division — the viewer's primary
  // pool renders at the top, but the "Other pools" dropdown below
  // lets them peek at any other live pool read-only (same spirit as
  // the ladder session's "see other courts" view).
  const activeDivisionList = Array.from(activeDivisionSet) as string[];
  const { data: allActiveMatches } = await supabase
    .from("tournament_matches")
    .select(
      "*, player1:profiles!player1_id(id, display_name, avatar_url), player2:profiles!player2_id(id, display_name, avatar_url)"
    )
    .eq("tournament_id", tournamentId)
    .in("division", activeDivisionList.length > 0 ? activeDivisionList : [myDivision])
    .order("round", { ascending: true })
    .order("match_number", { ascending: true });

  // Player's pool = the bracket they appear in within their division.
  // Use a pool-play match (not playoff) so a player who's already
  // reached the playoff bracket still sees their pool on top.
  const myPoolMatch = (allActiveMatches ?? []).find(
    (m: any) =>
      m.division === myDivision &&
      m.bracket !== "playoff" &&
      (m.player1_id === teamPrimaryId || m.player2_id === teamPrimaryId)
  ) as any;
  const myBracket: string | null = myPoolMatch?.bracket ?? null;

  // Matches shown in the "your pool" region — same division + same
  // bracket. Falls back to all-division matches if we couldn't pin
  // down the bracket (e.g. the player is only in the playoff, which
  // we still want to display in the TournamentBracketView).
  const myDivisionMatches = (allActiveMatches ?? []).filter(
    (m: any) => m.division === myDivision
  );
  const matches = myBracket
    ? myDivisionMatches.filter(
        (m: any) => m.bracket === myBracket || m.bracket === "playoff"
      )
    : myDivisionMatches;

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

  // Partner map for doubles labels — scoped to every active
  // division so the "Other pools" viewer below can label those
  // rows correctly too, not just the viewer's own pool. We pull
  // seed numbers from the same query so the playoff bracket
  // renderer can show "(N)" beside team names.
  const partnerMap: PartnerMap = new Map();
  const seedByPlayerId = new Map<string, number>();
  if (activeDivisionList.length > 0) {
    const { data: regs } = await supabase
      .from("tournament_registrations")
      .select("player_id, partner_id, seed, division, partner:profiles!partner_id(display_name)")
      .eq("tournament_id", tournamentId)
      .in("division", activeDivisionList)
      .neq("status", "withdrawn");
    for (const r of (regs ?? []) as any[]) {
      if (r.player_id && r.partner_id) {
        partnerMap.set(r.player_id, r.partner?.display_name ?? "Partner");
      }
      // Compound key keeps multi-division registrants (Men's + Mixed)
      // distinct so each bracket shows the seed for that division.
      if (r.player_id && r.division && typeof r.seed === "number") {
        seedByPlayerId.set(`${r.division}|${r.player_id}`, r.seed);
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
  // Restrict the queue snapshot to the viewer's range scope so the
  // "Nth in line" subtitle reflects their actual wait time, not a
  // tournament-wide count that includes other ranges.
  const queueRows = (queueRowsRaw ?? []).filter((m: any) => {
    if (!m.division || !activeDivisionSet.has(m.division)) return false;
    if (scopeDivisionSet && !scopeDivisionSet.has(m.division)) return false;
    return true;
  });
  const myQueueIdx = queueRows.findIndex(
    (m: any) => m.player1_id === teamPrimaryId || m.player2_id === teamPrimaryId
  );
  const queueSubtitle = myOnCourtMatch
    ? `You're live on Court ${myOnCourtMatch.court_number}`
    : myQueueIdx >= 0
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
        queuePosition={myQueueIdx >= 0 ? myQueueIdx + 1 : null}
        queueSize={queueRows.length}
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
          winBy2={(tournament as any).win_by_2 ?? undefined}
          divisionSettings={(tournament as any).division_settings?.[myDivision] ?? null}
          embedded
        />
      </CollapsibleCard>

      {/* Match queue — collapsed by default. When the viewer is on a
          court the expanded content is just a "You're live!" banner;
          otherwise it's the full read-only Court Tracker + queue so
          players can spot friends and identify which court to watch. */}
      <CollapsibleCard
        // When the tournament has court ranges, name the viewer's
        // range right in the card title — "Match queue · Men's
        // Side" — so it's obvious this is THEIR queue, not a
        // global one. No-op when no ranges are defined.
        title={
          myCourtCardData
            ? "Court Tracker"
            : queueScopeLabel
              ? `Match queue · ${queueScopeLabel}`
              : "Match queue"
        }
        subtitle={queueSubtitle}
        defaultOpen={false}
      >
        <NextUpQueue
          tournamentId={tournamentId}
          myTeamPrimaryId={teamPrimaryId}
          isOnCourt={!!myCourtCardData}
          numCourts={tournament.num_courts ?? null}
          queueScopeDivisions={queueScopeDivisions}
          queueScopeLabel={queueScopeLabel}
          courtRanges={courtRanges.length > 0 ? courtRanges : null}
          myRangeId={myRangeId}
          embedded
        />
      </CollapsibleCard>

      <TournamentBracketView
        matches={(matches ?? []) as any}
        format={tournament.format}
        canManage={false}
        tournamentId={tournamentId}
        division={myDivision}
        scoreToWinPool={
          (tournament as any).division_settings?.[myDivision]?.score_to_win_pool ??
          tournament.score_to_win_pool ?? undefined
        }
        scoreToWinPlayoff={
          (tournament as any).division_settings?.[myDivision]?.score_to_win_playoff ??
          tournament.score_to_win_playoff ?? undefined
        }
        finalsBestOf3={tournament.finals_best_of_3 ?? undefined}
        winBy2={(tournament as any).win_by_2 ?? undefined}
        partnerMap={partnerMap}
        seedByPlayerId={seedByPlayerId}
      />

      {/* Read-only view into other pools — same division's other
          brackets + every other active division's pools. Players
          use this to spot friends or follow other matches they
          care about. */}
      <OtherPoolsViewer
        tournamentId={tournamentId}
        allActiveMatches={(allActiveMatches ?? []) as any}
        myDivision={myDivision}
        myBracket={myBracket}
        format={tournament.format}
        scoreToWinPool={tournament.score_to_win_pool ?? undefined}
        scoreToWinPlayoff={tournament.score_to_win_playoff ?? undefined}
        finalsBestOf3={tournament.finals_best_of_3 ?? undefined}
        winBy2={(tournament as any).win_by_2 ?? undefined}
        divisionSettings={(tournament as any).division_settings ?? null}
        partnerMap={partnerMap}
        seedByPlayerId={seedByPlayerId}
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
