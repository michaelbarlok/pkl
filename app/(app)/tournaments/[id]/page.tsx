import { EmptyState } from "@/components/empty-state";
import { getTournament, getTournamentRegistrations, getTournamentMatches, getMyRegistration, getMyRegistrations } from "@/lib/queries/tournament";
import { createClient } from "@/lib/supabase/server";
import { TournamentRegistrationButton } from "@/components/tournament-registration";
import { TournamentBracketView } from "@/components/tournament-bracket";
import type { PartnerMap } from "@/components/tournament-bracket";
import { TournamentRealtimeSubscription } from "@/components/tournament-realtime";
import { DivisionReview } from "@/components/division-review";
import { ActiveDivisionsManager } from "./active-divisions-manager";
import { CourtTracker } from "./court-tracker";
import type { CourtTrackerMatch } from "./court-tracker";
import { EndTournamentButton } from "./end-tournament-button";
import {
  AskToPartnerButton,
  RespondToRequestButtons,
  CancelRequestButton,
} from "./partner-request-buttons";
import { DeleteTournamentButton } from "@/components/delete-tournament-button";
import { CoOrganizerManager } from "@/components/co-organizer-manager";
import { CollapsibleCard } from "./collapsible-card";
import { getDivisionLabel } from "@/lib/divisions";
import { matchPositionLabel } from "@/lib/tournament-bracket";
import { DivisionBrackets } from "./division-brackets";
import { ContactOrganizersButton } from "@/components/contact-organizers-button";
import { Breadcrumb } from "@/components/breadcrumb";
import { formatDate, formatTime, formatDateTime } from "@/lib/utils";
import { PaidToggle } from "@/components/paid-toggle";
import { PaymentReminderButton } from "@/components/payment-reminder-button";
import { ShareBracketButton } from "@/components/share-bracket-button";
import { ShareTournamentButton } from "@/components/share-tournament-button";
import { HideTournamentToggle } from "@/app/(app)/admin/tournaments/hide-toggle";
import { TournamentWinnersCard } from "@/components/tournament-winners-card";
import { LocalDateTime } from "@/components/local-date-time";
import { tournamentHeroGradient } from "@/lib/tournament-hero";
import Link from "next/link";
import { notFound } from "next/navigation";

const FORMAT_LABELS: Record<string, string> = {
  single_elimination: "Single Elimination",
  double_elimination: "Double Elimination",
  round_robin: "Round Robin",
};

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-surface-overlay text-dark-200",
  registration_open: "bg-teal-900/30 text-teal-vivid",
  registration_closed: "bg-brand-900/40 text-brand-vivid",
  in_progress: "bg-accent-900/40 text-accent-300",
  completed: "bg-surface-overlay text-dark-200",
  cancelled: "bg-red-900/30 text-adaptive-red",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  registration_open: "Registration Open",
  registration_closed: "Registration Closed",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

/**
 * Split an ISO/date into month/day chip pieces for the hero.
 */
function tournamentDateChip(startIso: string, endIso: string | null) {
  const d = new Date((startIso.length === 10 ? startIso : startIso.slice(0, 10)) + "T12:00:00");
  const month = d.toLocaleDateString("en-US", { month: "short" }).toUpperCase();
  const day = String(d.getDate());
  // If the tournament spans multiple days, include the trailing day in a
  // subtle second line.
  let endDay: string | null = null;
  if (endIso && endIso !== startIso) {
    const e = new Date((endIso.length === 10 ? endIso : endIso.slice(0, 10)) + "T12:00:00");
    endDay = `–${e.getDate()}`;
  }
  return { month, day, endDay };
}

export default async function TournamentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Create a single supabase client for the page-level queries so it can be
  // reused for the organizers fetch without an extra createClient() call.
  const supabase = await createClient();

  const [
    tournament,
    registrations,
    matches,
    myRegistration,
    myRegistrations,
    organizersResult,
    activeDivisionsResult,
    pendingPartnerRequestsResult,
    { data: { user } },
  ] = await Promise.all([
      getTournament(id),
      getTournamentRegistrations(id),
      getTournamentMatches(id),
      getMyRegistration(id),
      getMyRegistrations(id),
      supabase
        .from("tournament_organizers")
        .select("profile_id, added_at, profile:profiles!profile_id(id, display_name)")
        .eq("tournament_id", id),
      supabase
        .from("tournament_active_divisions")
        .select("division")
        .eq("tournament_id", id),
      supabase
        .from("tournament_partner_requests")
        .select(
          "id, tournament_id, division, requester_id, target_id, status, created_at, requester:profiles!requester_id(id, display_name), target:profiles!target_id(id, display_name)"
        )
        .eq("tournament_id", id)
        .eq("status", "pending"),
      supabase.auth.getUser(),
    ]);

  if (!tournament) notFound();

  const { data: profile } = user
    ? await supabase.from("profiles").select("id, role").eq("user_id", user.id).single()
    : { data: null };
  const isCreator = profile?.id === tournament.created_by;
  const isAdmin = profile?.role === "admin";

  const coOrganizers = (organizersResult.data ?? []) as any[];
  const activeDivisions = ((activeDivisionsResult.data ?? []) as any[]).map((r) => r.division as string);
  const pendingPartnerRequests = (pendingPartnerRequestsResult.data ?? []) as any[];
  const isCoOrganizer = profile ? coOrganizers.some((o: any) => o.profile_id === profile.id) : false;
  const canManage = isCreator || isAdmin || isCoOrganizer;

  // Hidden tournaments are invisible to non-managers
  if ((tournament as any).is_hidden && !canManage) notFound();

  const myDivision = (myRegistration as any)?.division as string | undefined;
  const isInProgress = tournament.status === "in_progress" || tournament.status === "completed";

  const confirmedRegistrations = registrations.filter((r) => r.status === "confirmed");
  const waitlistRegistrations = registrations.filter((r) => r.status === "waitlist");

  // Compute per-division player counts for the review panel
  const divisionCounts = (tournament.divisions ?? []).map((code: string) => {
    const divRegs = confirmedRegistrations.filter((r: any) => r.division === code);
    return {
      division: code,
      count: divRegs.length,
      playerNames: divRegs.map((r: any) => r.player?.display_name ?? "Unknown"),
    };
  }).filter((d) => d.count > 0);

  // Build partner lookup for doubles display
  const partnerMap: PartnerMap = new Map();
  if (tournament.type === "doubles") {
    for (const reg of confirmedRegistrations) {
      const r = reg as any;
      if (r.player_id && r.partner?.display_name) {
        partnerMap.set(r.player_id, r.partner.display_name);
      }
    }
  }

  // Playoff seed lookup. Persisted on tournament_registrations.seed
  // when the playoff bracket is generated; the playoff bracket UI
  // renders "(N)" beside each team name from this map. Key is
  // "<division>|<player_id>" because the same player can legitimately
  // hold different seeds in different divisions (Men's + Mixed
  // multi-division registration). A flat player-only key would
  // collapse across divisions and double-print the same seed.
  const seedByPlayerId = new Map<string, number>();
  for (const reg of registrations) {
    const r = reg as any;
    if (r.player_id && r.division && typeof r.seed === "number") {
      seedByPlayerId.set(`${r.division}|${r.player_id}`, r.seed);
    }
  }

  // Only organizers see the bracket grid on the tournament page —
  // regular registered players are pointed to the Play tab for their
  // own pool. The group-by-division build below only feeds
  // DivisionBrackets which is canManage-gated further down.
  const matchesForBracket = canManage ? matches : [];

  // Group matches by division for display, using tournament.divisions order for stability
  const divisionMatchesTmp = new Map<string, typeof matches>();
  for (const m of matchesForBracket) {
    const div = (m as any).division ?? "__none__";
    if (!divisionMatchesTmp.has(div)) divisionMatchesTmp.set(div, []);
    divisionMatchesTmp.get(div)!.push(m);
  }
  // Re-insert in stable order: tournament.divisions first, then any remaining keys
  const divisionMatches = new Map<string, typeof matches>();
  const divOrder = (tournament.divisions ?? []) as string[];
  for (const code of divOrder) {
    if (divisionMatchesTmp.has(code)) {
      divisionMatches.set(code, divisionMatchesTmp.get(code)!);
      divisionMatchesTmp.delete(code);
    }
  }
  for (const [key, val] of divisionMatchesTmp) {
    divisionMatches.set(key, val);
  }

  // Lifted out so the desktop layout can move them into a right-hand
  // column next to the hero + details + registered cards, putting the
  // wide unused space on lg+ screens to work during live play.
  //
  // Stays visible for the entire in_progress lifecycle — pool play,
  // playoffs, even after every division's winner has been decided —
  // until the organizer taps End Tournament (which flips status to
  // completed and clears tournament_active_divisions). Empty courts
  // and an empty queue are fine states to show; they give the
  // organizer a stable dashboard and avoid the "where'd it go?"
  // confusion when a division briefly has no eligible matches.
  const hasCourtTracker =
    canManage &&
    tournament.status === "in_progress" &&
    ((tournament as any).num_courts ?? 0) > 0;

  const courtTrackerBlock = hasCourtTracker
    ? (() => {
        const numCourts = (tournament as any).num_courts as number;
        const activeSet = new Set(activeDivisions);
        // Per-division max playoff round, so playoff cards can label
        // themselves "Semifinal" / "Final" / "3rd Place" instead of a
        // generic "Round N". 4-team playoffs go to round 2 (R1=semis,
        // R2=final+3rd), 6-team to round 3, 8+ deeper.
        const maxPlayoffRoundByDivision = new Map<string, number>();
        for (const m of matches as any[]) {
          if (m.bracket !== "playoff" || !m.division) continue;
          const cur = maxPlayoffRoundByDivision.get(m.division) ?? 0;
          if (m.round > cur) maxPlayoffRoundByDivision.set(m.division, m.round);
        }
        const finalsBestOf3 = (tournament.finals_best_of_3 ?? false) as boolean;
        const toTracker = (m: any): CourtTrackerMatch => ({
          id: m.id,
          division: m.division ?? null,
          round: m.round,
          match_number: m.match_number,
          bracket: m.bracket,
          player1_id: m.player1_id ?? null,
          player2_id: m.player2_id ?? null,
          player1_name: m.player1?.display_name ?? null,
          partner1_name: m.player1_id ? partnerMap.get(m.player1_id) ?? null : null,
          player2_name: m.player2?.display_name ?? null,
          partner2_name: m.player2_id ? partnerMap.get(m.player2_id) ?? null : null,
          court_number: m.court_number ?? null,
          queue_entered_at: m.queue_entered_at ?? null,
          status: m.status,
          position_label: matchPositionLabel(
            m,
            m.division ? maxPlayoffRoundByDivision.get(m.division) ?? null : null,
            finalsBestOf3
          ),
        });

        const onCourtMatches = matches
          .filter(
            (m: any) =>
              m.status === "pending" &&
              m.court_number != null &&
              m.division &&
              activeSet.has(m.division)
          )
          .map(toTracker);

        // Strict FIFO — queue_entered_at is staggered at enqueue
        // time (engine does the cross-division interleave there),
        // so the read path is a pure timestamp sort.
        const queuedMatches = (matches
          .filter(
            (m: any) =>
              m.status === "pending" &&
              m.court_number == null &&
              m.queue_entered_at != null &&
              m.player1_id &&
              m.player2_id &&
              m.division &&
              activeSet.has(m.division)
          )
          .sort((a: any, b: any) =>
            new Date(a.queue_entered_at).getTime() -
            new Date(b.queue_entered_at).getTime()
          ) as any[]).map(toTracker);

        return (
          <CourtTracker
            tournamentId={id}
            numCourts={numCourts}
            onCourt={onCourtMatches}
            queue={queuedMatches}
          />
        );
      })()
    : null;

  const hasDivisionBrackets = matches.length > 0 && canManage;
  const divisionBracketsBlock = hasDivisionBrackets ? (
    <DivisionBrackets
      divisionMatchesEntries={Array.from(divisionMatches.entries()).map(([div, divMatches]) => ({
        division: div,
        matches: divMatches,
      }))}
      tournament={{
        format: tournament.format,
        score_to_win_pool: tournament.score_to_win_pool ?? undefined,
        score_to_win_playoff: tournament.score_to_win_playoff ?? undefined,
        finals_best_of_3: tournament.finals_best_of_3 ?? undefined,
      }}
      canManage={canManage}
      tournamentId={id}
      myDivision={myDivision}
      partnerMap={partnerMap}
      seedByPlayerId={seedByPlayerId}
      isRoundRobin={tournament.format === "round_robin"}
      activeDivisions={activeDivisions}
      divisionSettings={(tournament as any).division_settings ?? null}
    />
  ) : null;

  const hasRightColumn = !!(courtTrackerBlock || divisionBracketsBlock);
  // Desktop layout:
  //   - Main content (hero, details, registered, etc.) in the left
  //     lane.
  //   - Court Tracker gets its own sidebar lane when present — it's
  //     a compact vertical dashboard that reads well at ~600px.
  //   - Division Brackets drop BELOW the grid as a full-width band
  //     when present. Elimination + round-robin playoff trees need
  //     at least 900px to render without horizontal scroll; forcing
  //     them into a sidebar lane was clipping half the bracket.
  const hasCourtTrackerLane = !!courtTrackerBlock;
  // Tournaments with lots of courts want a wider Court Tracker lane
  // so the internal courts-grid can fit 3 columns of tiles. Favor
  // the right side when >10 courts; stay even otherwise so the hero
  // + details block doesn't feel cramped.
  const manyCourts = ((tournament as any).num_courts ?? 0) > 10;
  const containerMaxW = hasCourtTrackerLane || divisionBracketsBlock
    ? "max-w-3xl lg:max-w-none"
    : "max-w-3xl lg:max-w-7xl";
  const gridClasses = hasCourtTrackerLane
    ? manyCourts
      ? "lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:gap-6 lg:items-start space-y-6 lg:space-y-0"
      : "lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-6 lg:items-start space-y-6 lg:space-y-0"
    : "space-y-6";

  return (
    <div className={`${containerMaxW} mx-auto space-y-6`}>
      {/* Real-time bracket updates */}
      {isInProgress && <TournamentRealtimeSubscription tournamentId={id} />}

      <Breadcrumb items={[{ label: "Tournaments", href: "/tournaments" }, { label: tournament.title }]} />

      {/* Winners podium — only renders on completed tournaments.
          Pinned above the grid so every division's champions are
          the first thing a visitor sees on a finished event. */}
      {tournament.status === "completed" && (
        <TournamentWinnersCard
          tournamentId={id}
          divisions={(tournament.divisions ?? []) as string[]}
          matches={matches as any}
          partnerMap={partnerMap}
        />
      )}

      <div className={gridClasses}>
        <div className="space-y-6 min-w-0">

      {/* Hero */}
      {(() => {
        const chip = tournamentDateChip(tournament.start_date, tournament.end_date ?? null);
        const heroTint = tournamentHeroGradient(id);
        const isLive = tournament.status === "in_progress";
        return (
          <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${heroTint} ring-1 ring-surface-border`}>
            <div className="p-5 sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[tournament.status]}`}>
                      {isLive && <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-accent-300 animate-pulse align-middle" />}
                      {STATUS_LABELS[tournament.status]}
                    </span>
                    {(tournament as any).is_hidden && canManage && (
                      <span className="inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium bg-amber-900/40 text-amber-300">
                        Hidden from public
                      </span>
                    )}
                  </div>
                  <div className="mt-2 flex items-start gap-3 min-w-0">
                    {(tournament as any).logo_url && (
                      // object-contain + tinted frame so wide / tall /
                      // transparent logos render fully at a consistent
                      // 56-64px box — no cropping.
                      <div className="h-14 w-14 sm:h-16 sm:w-16 shrink-0 rounded-lg bg-surface-overlay ring-1 ring-surface-border flex items-center justify-center overflow-hidden">
                        <img
                          src={(tournament as any).logo_url}
                          alt=""
                          className="h-full w-full object-contain p-1"
                          loading="eager"
                        />
                      </div>
                    )}
                    <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-dark-100 break-words min-w-0">
                      {tournament.title}
                    </h1>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-dark-200">
                    <span className="inline-flex items-center gap-1.5">
                      <svg className="h-4 w-4 text-dark-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0zM19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                      </svg>
                      {tournament.location}
                    </span>
                    {tournament.start_time && (
                      <span className="inline-flex items-center gap-1.5">
                        <svg className="h-4 w-4 text-dark-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z" />
                        </svg>
                        {formatTime(tournament.start_time)}
                      </span>
                    )}
                  </div>

                  {/* Format pill row */}
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    <span className="badge-blue text-xs">
                      {FORMAT_LABELS[tournament.format]}
                    </span>
                    <span className="badge-gray text-xs">
                      {tournament.type === "doubles" ? "Doubles" : "Singles"}
                    </span>
                    <span className="badge-gray text-xs">
                      {tournament.divisions?.length ?? 0} division{(tournament.divisions?.length ?? 0) !== 1 ? "s" : ""}
                    </span>
                  </div>
                </div>

                {/* Date chip */}
                <div className="shrink-0 text-right">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-dark-200 leading-none">
                    {chip.month}
                  </p>
                  <p className="text-4xl sm:text-5xl font-bold leading-none mt-1 text-dark-100">
                    {chip.day}
                    {chip.endDay && (
                      <span className="text-xl font-semibold text-dark-200 align-top ml-0.5">
                        {chip.endDay}
                      </span>
                    )}
                  </p>
                </div>
              </div>

              {/* Hero action row */}
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {!(tournament as any).is_hidden && (
                  <ShareTournamentButton
                    tournamentId={id}
                    title={tournament.title}
                    summary={`${tournament.title} — ${formatDate(tournament.start_date + "T00:00:00")} at ${tournament.location}`}
                  />
                )}
                {matches.length > 0 && !(tournament as any).is_hidden && (
                  <ShareBracketButton tournamentId={id} />
                )}
                {canManage && (
                  <Link href={`/tournaments/${id}/edit`} className="btn-secondary text-xs">
                    Edit
                  </Link>
                )}
                {/* Global admins can flip visibility right from the page;
                     exposed here (in addition to /admin/tournaments) so the
                     toggle is one tap away on mobile. The API gates this
                     to admins, so non-admin managers don't see it. */}
                {isAdmin && (
                  <HideTournamentToggle
                    tournamentId={id}
                    isHidden={(tournament as any).is_hidden ?? false}
                  />
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Tournament details — collapsible once play is underway so
          the Court Tracker and Live Divisions cards own the viewport
          during matches. Co-organizer management lives inside so we
          only render the editable list in one place. */}
      <CollapsibleCard
        title="Tournament Details"
        subtitle={
          tournament.status === "in_progress"
            ? "Dates, payments, divisions, and organizer list"
            : undefined
        }
        defaultOpen={tournament.status !== "in_progress"}
      >
        <dl className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
          <DetailRow label={`Organizer${coOrganizers.length > 0 ? "s" : ""}`}>
            <span className="text-sm text-dark-100">
              {tournament.creator?.display_name ?? "Unknown"}
              {coOrganizers.length > 0 && (
                <span className="text-dark-200">
                  {", "}{coOrganizers.map((o: any) => o.profile?.display_name ?? "Unknown").join(", ")}
                </span>
              )}
            </span>
          </DetailRow>
          <DetailRow label="Date">
            <span className="text-sm text-dark-100">
              {formatDate(tournament.start_date + "T00:00:00")}
              {tournament.end_date !== tournament.start_date && (
                <> — {formatDate(tournament.end_date + "T00:00:00")}</>
              )}
            </span>
          </DetailRow>
          {tournament.max_teams_per_division && (
            <DetailRow label="Max per Division">
              <span className="text-sm text-dark-100">{tournament.max_teams_per_division} teams</span>
            </DetailRow>
          )}
          {tournament.entry_fee && (
            <DetailRow label="Entry Fee">
              <span className="text-sm text-dark-100">{tournament.entry_fee}</span>
            </DetailRow>
          )}
          {(tournament as any).registration_opens_at && tournament.status === "draft" && (
            <DetailRow label="Registration Opens">
              <span className="text-sm text-dark-100">
                <LocalDateTime iso={(tournament as any).registration_opens_at} />
              </span>
            </DetailRow>
          )}
          {tournament.registration_closes_at && (
            <DetailRow label="Registration Closes">
              <span className="text-sm text-dark-100">
                <LocalDateTime iso={tournament.registration_closes_at} />
              </span>
            </DetailRow>
          )}
          {tournament.payment_options && tournament.payment_options.length > 0 && (
            <DetailRow label="Pay Via">
              <div className="space-y-1">
                {tournament.payment_options.map((opt) => (
                  <p key={opt.method} className="text-sm text-dark-100">
                    <span className="font-medium capitalize">{opt.method}</span>
                    {opt.detail && (
                      <span className="text-dark-200">
                        {" — "}
                        {opt.method === "paypal" || opt.method === "other"
                          ? <a href={opt.detail.startsWith("http") ? opt.detail : `https://${opt.detail}`} target="_blank" rel="noopener noreferrer" className="text-brand-vivid hover:underline">{opt.detail}</a>
                          : opt.detail}
                      </span>
                    )}
                  </p>
                ))}
              </div>
            </DetailRow>
          )}
          {(tournament as any).payment_link && (
            <DetailRow label="Payment Link">
              <a
                href={(tournament as any).payment_link}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-brand-vivid hover:underline break-all"
              >
                {(tournament as any).payment_link}
              </a>
            </DetailRow>
          )}
        </dl>

        {(tournament as any).payment_directions && (
          <div className="pt-3 border-t border-surface-border">
            <p className="text-xs text-surface-muted uppercase font-medium mb-1">Payment Directions</p>
            <p className="text-sm text-dark-100 whitespace-pre-line">{(tournament as any).payment_directions}</p>
          </div>
        )}

        {tournament.format === "round_robin" && (tournament.score_to_win_pool || tournament.score_to_win_playoff) && (
          <div className="pt-3 border-t border-surface-border">
            <div className="flex flex-wrap gap-4">
              <div>
                <p className="text-xs text-surface-muted uppercase font-medium">Pool Games To</p>
                <p className="text-sm text-dark-100">{tournament.score_to_win_pool ?? 11}</p>
              </div>
              <div>
                <p className="text-xs text-surface-muted uppercase font-medium">Playoff Games To</p>
                <p className="text-sm text-dark-100">{tournament.score_to_win_playoff ?? 11}</p>
              </div>
              {tournament.finals_best_of_3 && (
                <div>
                  <p className="text-xs text-surface-muted uppercase font-medium">Finals</p>
                  <p className="text-sm text-dark-100">Best 2 of 3</p>
                </div>
              )}
            </div>
          </div>
        )}

        {tournament.description && (
          <div className="pt-3 border-t border-surface-border">
            <p className="text-sm text-dark-200 whitespace-pre-wrap leading-relaxed">{tournament.description}</p>
          </div>
        )}

        {/* Contact Organizers — visible to logged-in non-organizers */}
        {profile && !canManage && (
          <div className="pt-3 border-t border-surface-border">
            <ContactOrganizersButton
              endpoint={`/api/tournaments/${id}/contact-organizers`}
              label="Contact Organizers"
            />
          </div>
        )}

        {/* Divisions — render per-division start times alongside each
            badge when the organizer has set a per-division override.
            Falls through to the tournament-level start_time chip in
            the hero when no override is present. */}
        {tournament.divisions && tournament.divisions.length > 0 && (() => {
          const settings = ((tournament as any).division_settings ?? {}) as Record<
            string,
            { start_time?: string } | null
          >;
          const hasAnyOverride = Object.values(settings).some(
            (v) => v && typeof v.start_time === "string" && v.start_time
          );
          return (
            <div className="pt-3 border-t border-surface-border">
              <p className="text-xs text-surface-muted uppercase font-medium mb-2">Divisions</p>
              {hasAnyOverride ? (
                <ul className="space-y-1">
                  {tournament.divisions.map((code: string) => {
                    const t = settings[code]?.start_time;
                    return (
                      <li key={code} className="flex items-center gap-2 text-sm">
                        <span className="badge-blue text-xs">
                          {getDivisionLabel(code)}
                        </span>
                        <span className="text-dark-200">
                          {t
                            ? formatTime(t)
                            : tournament.start_time
                              ? `${formatTime(tournament.start_time)} (default)`
                              : ""}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {tournament.divisions.map((code: string) => (
                    <span key={code} className="badge-blue text-xs">
                      {getDivisionLabel(code)}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })()}

        {/* Co-Organizer management — folded into the details card so
            the same organizer data isn't duplicated in a separate
            panel. Only the creator or a site admin can manage here. */}
        {(isCreator || isAdmin) && (
          <div className="pt-3 border-t border-surface-border">
            <CoOrganizerManager
              tournamentId={id}
              coOrganizers={coOrganizers}
              creatorId={tournament.created_by}
              embedded
            />
          </div>
        )}
      </CollapsibleCard>

      {/* Registration Action */}
      <div id="register" />
      {profile && tournament.status === "registration_open" && (
        <TournamentRegistrationButton
          tournamentId={id}
          tournamentType={tournament.type}
          divisions={tournament.divisions ?? []}
          myRegistration={myRegistration}
          myRegistrations={myRegistrations}
          playerCap={tournament.player_cap}
          maxTeamsPerDivision={tournament.max_teams_per_division}
          confirmedCount={confirmedRegistrations.length}
          divisionConfirmedCounts={Object.fromEntries(
            (tournament.divisions ?? []).map((code: string) => [
              code,
              confirmedRegistrations.filter((r: any) => r.division === code).length,
            ])
          )}
        />
      )}

      {/* Organizer Controls */}
      {canManage && tournament.status !== "cancelled" && (
        <>
          {/* Division Review (shown when registration is closed, before bracket generation) */}
          {tournament.status === "registration_closed" && (
            <DivisionReview
              tournamentId={id}
              divisions={divisionCounts}
              format={tournament.format}
            />
          )}

          {/* Live division management (shown once brackets are
              generated). Collapsible so organizers can tuck it away
              once every division they care about is activated and
              focus on the Court Tracker. Default open so the first
              activation flow is front-and-center. */}
          {tournament.status === "in_progress" && divisionCounts.length > 0 && (
            <CollapsibleCard
              title="Live Divisions"
              subtitle={`${activeDivisions.length} of ${divisionCounts.length} live`}
              defaultOpen={false}
            >
              <ActiveDivisionsManager
                tournamentId={id}
                numCourts={(tournament as any).num_courts ?? null}
                divisions={divisionCounts.map((d) => ({ division: d.division, count: d.count }))}
                initialActive={activeDivisions}
                embedded
              />
            </CollapsibleCard>
          )}

          {/* Court Tracker renders inline on mobile; on lg+ it shifts
              to the right-hand column (see the hidden/lg:block block
              below). Rendering it in both places keeps the source
              order unchanged on mobile so mid-page content like
              Registered/End Tournament still sits below play state. */}
          {courtTrackerBlock && (
            <div className="lg:hidden">{courtTrackerBlock}</div>
          )}

          {/* Simple status controls for non-bracket transitions */}
          <OrganizerControls
            tournamentId={id}
            status={tournament.status}
          />
        </>
      )}

      {/* (Co-Organizer management moved inside the Tournament
          Details card above — redundant panel removed.) */}

      {/* DivisionBrackets — same split-rendering trick as Court
          Tracker: mobile keeps it here in source order, lg+ hides
          this copy and renders the right-column version instead. */}
      {divisionBracketsBlock && (
        <div className="lg:hidden">{divisionBracketsBlock}</div>
      )}

      {/* Regular registered players get a pointer to the Play tab once
          the tournament is live. They don't see other divisions' brackets
          here — the Play tab is their focused view. If the organizer has
          already marked their division live, link straight to the live
          view; otherwise explain they're waiting. */}
      {tournament.status === "in_progress" && !canManage && myDivision && (
        <div className="card space-y-2">
          <h2 className="text-sm font-semibold text-dark-100">Your matches</h2>
          {activeDivisions.includes(myDivision) ? (
            <>
              <p className="text-xs text-surface-muted">
                Your division is live. Head to the Play tab to see your pool, next match, and court assignments.
              </p>
              <Link
                href="/sessions/active"
                className="btn-primary inline-flex items-center gap-2 text-sm"
              >
                View my pool &rarr;
              </Link>
            </>
          ) : (
            <p className="text-xs text-surface-muted">
              Waiting for the organizer to activate {getDivisionLabel(myDivision)}. You&apos;ll get a push notification the moment it goes live.
            </p>
          )}
        </div>
      )}

      {/* Pending partner requests — viewer may be a target (incoming)
          or a requester (outgoing). RLS on tournament_partner_requests
          already ensures we only see rows that involve us or that we
          organize, so we can render both roles from the same list. */}
      {profile && pendingPartnerRequests.length > 0 && (
        <div className="card space-y-3">
          <h2 className="text-sm font-semibold text-dark-100">Partner Requests</h2>
          <ul className="space-y-2">
            {pendingPartnerRequests.map((rq) => {
              const isIncoming = rq.target_id === profile.id;
              const isOutgoing = rq.requester_id === profile.id;
              if (!isIncoming && !isOutgoing && !canManage) return null;
              const other = isIncoming
                ? rq.requester?.display_name ?? "Someone"
                : rq.target?.display_name ?? "Someone";
              return (
                <li
                  key={rq.id}
                  className="flex items-center justify-between gap-3 rounded-md bg-surface-overlay px-3 py-2"
                >
                  <div className="text-xs">
                    <p className="text-dark-100">
                      {isIncoming
                        ? `${other} wants to partner with you`
                        : `You asked ${other} to partner`}
                    </p>
                    <p className="text-surface-muted">
                      {getDivisionLabel(rq.division)}
                    </p>
                  </div>
                  {isIncoming ? (
                    <RespondToRequestButtons tournamentId={id} requestId={rq.id} />
                  ) : isOutgoing ? (
                    <CancelRequestButton tournamentId={id} requestId={rq.id} />
                  ) : (
                    <span className="text-xs text-surface-muted">Waiting on reply</span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Registrations List — once the tournament goes live the
          registered list takes a back seat to the Court Tracker +
          Live Divisions cards, so collapse it by default (organizer
          can expand to look up a specific team or handle payments). */}
      {(() => {
        const shouldCollapse =
          tournament.status === "in_progress" || tournament.status === "completed";
        const paidCount = confirmedRegistrations.filter((r: any) => r.paid).length;
        const unpaidCount = confirmedRegistrations.length - paidCount;
        const registeredCountLabel = `Registered (${confirmedRegistrations.length}${tournament.player_cap ? `/${tournament.player_cap}` : ""})`;
        const paidSubtitle = canManage && tournament.entry_fee && confirmedRegistrations.length > 0
          ? `${paidCount} of ${confirmedRegistrations.length} paid`
          : undefined;

        const headerRow = (
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <h2 className="text-lg font-semibold text-dark-100">
              {registeredCountLabel}
            </h2>
            {canManage && tournament.entry_fee && confirmedRegistrations.length > 0 && (
              <>
                <span className="text-xs text-surface-muted">
                  {paidCount} of {confirmedRegistrations.length} paid
                </span>
                <PaymentReminderButton tournamentId={id} unpaidCount={unpaidCount} />
              </>
            )}
          </div>
        );

        const tableOrEmpty = confirmedRegistrations.length > 0 ? (
          <div className="card overflow-x-auto p-0">
            <table className="min-w-full divide-y divide-surface-border">
              <thead className="bg-surface-overlay">
                <tr>
                  <th className="px-2 sm:px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-surface-muted w-8">#</th>
                  <th className="px-2 sm:px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-surface-muted">Player</th>
                  {tournament.type === "doubles" && (
                    <th className="px-2 sm:px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-surface-muted">Partner</th>
                  )}
                  <th className="px-2 sm:px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-surface-muted">Division</th>
                  {canManage && (
                    <th className="px-2 sm:px-4 py-2 text-center text-xs font-medium uppercase tracking-wider text-surface-muted">Seed</th>
                  )}
                  {canManage && tournament.entry_fee && (
                    <th className="px-2 sm:px-4 py-2 text-center text-xs font-medium uppercase tracking-wider text-surface-muted">Paid</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border bg-surface-raised">
                {confirmedRegistrations.map((reg, i) => {
                  const playerId = (reg as any).player_id as string | undefined;
                  const needsPartner =
                    tournament.type === "doubles" &&
                    !(reg as any).partner_id;
                  // The viewer can ask if they themselves are still
                  // partner-less — that includes the "I haven't
                  // registered" case AND the "I registered solo
                  // looking for a partner" case. Previously the
                  // second case was blocked, so two need-partner
                  // players couldn't pair up without one withdrawing
                  // and re-registering.
                  const viewerIsPartnerless =
                    !myRegistration ||
                    !(myRegistration as any).partner_id;
                  const viewerCanAsk =
                    needsPartner &&
                    profile &&
                    playerId &&
                    profile.id !== playerId &&
                    viewerIsPartnerless;
                  return (
                  <tr key={reg.id}>
                    <td className="px-2 sm:px-4 py-2 text-sm text-surface-muted">{i + 1}</td>
                    <td className="px-2 sm:px-4 py-2 text-sm font-medium text-dark-100">
                      {(reg as any).player?.display_name ?? "Unknown"}
                    </td>
                    {tournament.type === "doubles" && (
                      <td className="px-2 sm:px-4 py-2 text-sm text-dark-200">
                        {(reg as any).partner?.display_name ? (
                          (reg as any).partner.display_name
                        ) : (
                          <span className="inline-flex items-center gap-2">
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-accent-500/15 text-accent-300 ring-1 ring-accent-500/40">
                              Need Partner
                            </span>
                            {viewerCanAsk && playerId && (
                              <AskToPartnerButton
                                tournamentId={id}
                                targetId={playerId}
                                targetName={(reg as any).player?.display_name ?? "this player"}
                              />
                            )}
                          </span>
                        )}
                      </td>
                    )}
                    <td className="px-2 sm:px-4 py-2 text-xs">
                      {(reg as any).division ? (
                        <span className="badge-blue">{getDivisionLabel((reg as any).division)}</span>
                      ) : (
                        <span className="text-surface-muted">—</span>
                      )}
                    </td>
                    {canManage && (
                      <td className="px-2 sm:px-4 py-2 text-center text-sm text-surface-muted">
                        {reg.seed ?? "—"}
                      </td>
                    )}
                    {canManage && tournament.entry_fee && (
                      <td className="px-2 sm:px-4 py-2 text-center">
                        <PaidToggle
                          registrationId={reg.id}
                          isPaid={(reg as any).paid ?? false}
                        />
                      </td>
                    )}
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="No registrations yet"
            description="Be the first to register for this tournament."
          />
        );

        if (shouldCollapse) {
          // Payment reminder UI is tucked into the body because it
          // has interactive state; CollapsibleCard only carries the
          // plain count + paid-summary in its subtitle.
          return (
            <CollapsibleCard
              title={registeredCountLabel}
              subtitle={paidSubtitle}
              defaultOpen={false}
            >
              {canManage && tournament.entry_fee && confirmedRegistrations.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                  <PaymentReminderButton tournamentId={id} unpaidCount={unpaidCount} />
                </div>
              )}
              {tableOrEmpty}
            </CollapsibleCard>
          );
        }

        return (
          <div>
            {headerRow}
            {tableOrEmpty}
          </div>
        );
      })()}

      {/* Waitlist */}
      {waitlistRegistrations.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-dark-100 mb-3">
            Waitlist ({waitlistRegistrations.length})
          </h2>
          {/* Group waitlist by division if there are multiple divisions */}
          {(tournament.divisions?.length ?? 0) > 1 ? (
            <div className="space-y-4">
              {(tournament.divisions ?? []).map((code: string) => {
                const divWaitlist = waitlistRegistrations
                  .filter((r: any) => r.division === code)
                  .sort((a, b) => (a.waitlist_position ?? 999) - (b.waitlist_position ?? 999));
                if (divWaitlist.length === 0) return null;
                return (
                  <div key={code}>
                    <p className="text-xs font-medium text-surface-muted uppercase mb-1">
                      {getDivisionLabel(code)}
                    </p>
                    <div className="card space-y-1">
                      {divWaitlist.map((reg, i) => (
                        <div key={reg.id} className="flex items-center gap-2 text-sm">
                          <span className="text-surface-muted w-6">{i + 1}.</span>
                          <span className="text-dark-200">{(reg as any).player?.display_name ?? "Unknown"}</span>
                          {tournament.type === "doubles" && (reg as any).partner && (
                            <span className="text-surface-muted">& {(reg as any).partner?.display_name}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="card space-y-1">
              {waitlistRegistrations.map((reg, i) => (
                <div key={reg.id} className="flex items-center gap-2 text-sm">
                  <span className="text-surface-muted w-6">{i + 1}.</span>
                  <span className="text-dark-200">{(reg as any).player?.display_name ?? "Unknown"}</span>
                  {tournament.type === "doubles" && (reg as any).partner && (
                    <span className="text-surface-muted">& {(reg as any).partner?.display_name}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* End Tournament — collapsible and closed by default so a
          stray tap can't trigger the confirm modal. Organizer has
          to expand deliberately. Lives just above Danger Zone. */}
      {canManage && tournament.status === "in_progress" && (
        <CollapsibleCard title="End Tournament" defaultOpen={false}>
          <p className="text-xs text-surface-muted">
            Ending the tournament locks all results and emails a recap to every player and organizer. You can&apos;t end it until every match has a score.
          </p>
          <EndTournamentButton tournamentId={id} />
        </CollapsibleCard>
      )}

      {/* Danger Zone — collapsible, closed by default. Wrapped in
          red ring so it's visually unmistakable even folded. */}
      {canManage && tournament.status !== "cancelled" && (
        <div className="rounded-lg ring-1 ring-red-500/30">
          <CollapsibleCard title="Danger Zone" defaultOpen={false}>
            <p className="text-xs text-surface-muted">
              Cancel or delete this tournament. Both are destructive and can&apos;t be undone.
            </p>
            <div className="flex flex-wrap gap-2">
              {tournament.status !== "completed" && (
                <StatusAdvanceButton
                  tournamentId={id}
                  nextStatus="cancelled"
                  label="Cancel Tournament"
                  variant="danger"
                />
              )}
              <DeleteTournamentButton tournamentId={id} />
            </div>
          </CollapsibleCard>
        </div>
      )}
        </div>

        {/* Court Tracker sidebar on lg+ — only shown when present. */}
        {courtTrackerBlock && (
          <div className="hidden lg:block space-y-6 min-w-0">
            {courtTrackerBlock}
          </div>
        )}
      </div>

      {/* Division Brackets get the full container width on lg+ so
           wide elimination trees (or round-robin playoff brackets
           with multiple rounds) render without horizontal clipping.
           Inline lg:hidden copies elsewhere handle the mobile view. */}
      {divisionBracketsBlock && (
        <div className="hidden lg:block space-y-6 min-w-0">
          {divisionBracketsBlock}
        </div>
      )}
    </div>
  );
}

/** Single label → value cell used inside the tournament details grid. */
function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] text-surface-muted uppercase font-medium tracking-wide">
        {label}
      </dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}

function OrganizerControls({
  tournamentId,
  status,
}: {
  tournamentId: string;
  status: string;
}) {
  const nextAction: Record<string, { label: string; next: string; variant?: "primary" | "secondary" | "danger" }> = {
    draft: { label: "Open Registration", next: "registration_open" },
    registration_open: { label: "Close Registration", next: "registration_closed" },
    registration_closed: { label: "Reopen Registration", next: "registration_open", variant: "secondary" },
  };

  // in_progress → completed moves to the bottom of the page (just
  // above the Danger Zone) so the organizer has to scroll past all
  // the live data before ending things. Rendered separately below.
  if (status === "in_progress") return null;

  const action = nextAction[status];
  if (!action) return null;

  return (
    <div className="card">
      <h2 className="text-sm font-semibold text-dark-200 mb-3">Organizer Controls</h2>
      <div className="flex flex-wrap gap-2">
        <StatusAdvanceButton
          tournamentId={tournamentId}
          nextStatus={action.next}
          label={action.label}
          variant={action.variant ?? "primary"}
        />
      </div>
    </div>
  );
}

function StatusAdvanceButton({
  tournamentId,
  nextStatus,
  label,
  variant = "primary",
}: {
  tournamentId: string;
  nextStatus: string;
  label: string;
  variant?: "primary" | "secondary" | "danger";
}) {
  async function advance() {
    "use server";
    const supabase = await createClient();
    // When the organizer manually opens or reopens registration we
    // also clear the scheduled window timestamps. Without this, the
    // tournament-registration-windows cron would immediately re-flip
    // the status: a stale registration_closes_at in the past keeps
    // forcing the row back to registration_closed every minute,
    // making the Reopen button effectively useless. The organizer's
    // manual click trumps the schedule — they can re-set close
    // times via Edit if they want a future auto-close.
    const updates: Record<string, unknown> = { status: nextStatus };
    if (nextStatus === "registration_open") {
      updates.registration_closes_at = null;
      updates.registration_opens_at = null;
    }
    await supabase.from("tournaments").update(updates).eq("id", tournamentId);
    const { revalidatePath } = await import("next/cache");
    revalidatePath(`/tournaments/${tournamentId}`);
  }

  return (
    <form action={advance}>
      <button
        type="submit"
        className={
          variant === "danger"
            ? "btn-secondary !border-red-500/50 !text-red-400 hover:!bg-red-900/20"
            : variant === "secondary"
            ? "btn-secondary"
            : "btn-primary"
        }
      >
        {label}
      </button>
    </form>
  );
}
