import { createClient } from "@/lib/supabase/server";
import { getDivisionLabel } from "@/lib/divisions";
import { matchPositionLabel } from "@/lib/tournament-bracket";
import { FirstChoiceBadge } from "@/components/first-choice-badge";

interface Props {
  tournamentId: string;
  /** Map<match_id, "team1" | "team2"> built upstream from the full
   *  set of active-division matches. Pool play is balanced; playoffs
   *  go to the higher seed. Optional — when missing or a match isn't
   *  in the map, the badge just isn't rendered. */
  firstChoiceMap?: Map<string, "team1" | "team2"> | null;
  /** The viewer's team primary — matches tournament_matches.player1_id /
   *  player2_id. Used to highlight the viewer's team in the queue. */
  myTeamPrimaryId: string;
  /** True when the viewer's team currently holds a court. In that
   *  case we skip the full queue list and render a compact
   *  "You're live!" panel instead — they don't need to be staring
   *  at who's up next; they're about to play. */
  isOnCourt?: boolean;
  /** Optional — total court count so we can fill open slots. */
  numCourts?: number | null;
  /** Drop the internal header + position summary because the
   *  caller's already rendering those in the surrounding collapsible
   *  card. */
  embedded?: boolean;
  /** Restricts the Match Queue to a specific set of divisions —
   *  the divisions belonging to the viewer's court range. NULL or
   *  undefined means no scoping (legacy / no court ranges defined),
   *  so the queue spans every active division. The court grid above
   *  is always full-tournament so players can spot friends. */
  queueScopeDivisions?: string[] | null;
  /** Short, viewer-facing label for the scope — shown next to the
   *  "Match Queue" heading so a player understands they're looking
   *  at their own range's queue and not the entire tournament. */
  queueScopeLabel?: string | null;
  /** Court range layout for the tournament. When present, the
   *  Courts grid splits into one labelled section per range so a
   *  player sees "Men's Side · Courts 1–10" framing the same way
   *  the organizer's tracker does. The section that matches the
   *  viewer's own range is highlighted. NULL or empty means a
   *  single un-labelled grid. */
  courtRanges?: {
    id: string;
    label: string;
    court_start: number;
    court_end: number;
    divisions: string[];
  }[] | null;
  /** ID of the range the viewer's division belongs to (if any) so
   *  we can visually mark "your range" inside the grid. NULL when
   *  the viewer's division isn't assigned to any range, or when
   *  the tournament doesn't define ranges. */
  myRangeId?: string | null;
}

/**
 * Player-side read-only view of the live Court Tracker + Match Queue.
 *
 * When the viewer isn't currently on a court, this renders:
 *   - Every court across every active division (not just the
 *     viewer's — players want to identify friends and watch
 *     neighboring matches).
 *   - The full FIFO queue, with the viewer's own team row
 *     accent-highlighted. "Up next" badge on row 0.
 *
 * When the viewer IS on a court, we short-circuit to a brief
 * "You're live!" banner — the full queue isn't useful right now,
 * they should be walking to their court.
 */
export async function NextUpQueue({
  tournamentId,
  myTeamPrimaryId,
  isOnCourt = false,
  numCourts = null,
  embedded = false,
  queueScopeDivisions = null,
  queueScopeLabel = null,
  courtRanges = null,
  myRangeId = null,
  firstChoiceMap = null,
}: Props) {
  if (isOnCourt) {
    return (
      <div className="space-y-1 text-center py-4">
        <p className="text-base font-semibold text-brand-vivid">
          You&rsquo;re live!
        </p>
        <p className="text-xs text-surface-muted">
          Head to your court. The queue will be back once you&rsquo;re done.
        </p>
      </div>
    );
  }

  const supabase = await createClient();

  const { data: activeDivs } = await supabase
    .from("tournament_active_divisions")
    .select("division")
    .eq("tournament_id", tournamentId);
  const activeSet = new Set((activeDivs ?? []).map((r: any) => r.division));
  const activeDivArr = Array.from(activeSet) as string[];

  // Currently on-court matches across ALL active divisions — lets
  // the viewer see where friends are playing and which courts to
  // watch. Ordered by court number so the list reads like the
  // organizer's tracker.
  const { data: onCourtRaw } = await supabase
    .from("tournament_matches")
    .select(
      "id, division, round, match_number, bracket, series_game, court_number, player1_id, player2_id, player1:profiles!player1_id(display_name), player2:profiles!player2_id(display_name)"
    )
    .eq("tournament_id", tournamentId)
    .not("court_number", "is", null)
    .eq("status", "pending")
    .order("court_number", { ascending: true });
  const onCourt = (onCourtRaw ?? []).filter(
    (m: any) => m.division && activeSet.has(m.division)
  ) as any[];

  // Strict FIFO — staggered queue_entered_at written at enqueue
  // time, we just sort ASC here.
  const { data: matchesRaw } = await supabase
    .from("tournament_matches")
    .select(
      "id, division, round, match_number, bracket, series_game, court_number, queue_entered_at, player1_id, player2_id, player1:profiles!player1_id(display_name), player2:profiles!player2_id(display_name)"
    )
    .eq("tournament_id", tournamentId)
    .is("court_number", null)
    .eq("status", "pending")
    .not("queue_entered_at", "is", null)
    .order("queue_entered_at", { ascending: true })
    .limit(200);

  // Scope to active divisions, but DON'T filter by the viewer's
  // range — the layout below splits the queue into one bucket per
  // range (mirroring the organizer's Court Tracker), so a player can
  // see who's queued in every range, not just their own.
  const queue = (matchesRaw ?? []).filter((m: any) => {
    if (!m.division || !activeSet.has(m.division)) return false;
    return true;
  });

  // Per-division max playoff round so playoff cards can label
  // themselves "Semifinal" / "Final" / "3rd Place". Cheap separate
  // pull because the on-court / queue lists above are filtered to
  // pending only and we need every playoff round to know depth.
  const { data: playoffRoundsRaw } = await supabase
    .from("tournament_matches")
    .select("division, round")
    .eq("tournament_id", tournamentId)
    .eq("bracket", "playoff");
  const maxPlayoffRoundByDivision = new Map<string, number>();
  for (const r of (playoffRoundsRaw ?? []) as { division: string | null; round: number }[]) {
    if (!r.division) continue;
    const cur = maxPlayoffRoundByDivision.get(r.division) ?? 0;
    if (r.round > cur) maxPlayoffRoundByDivision.set(r.division, r.round);
  }
  function labelFor(m: { division: string | null; round: number; match_number: number; bracket: string }) {
    return matchPositionLabel(
      m,
      m.division ? maxPlayoffRoundByDivision.get(m.division) ?? null : null
    );
  }

  // Partner names for doubles labels, scoped to all active divisions.
  const { data: partnerRows } = activeDivArr.length
    ? await supabase
        .from("tournament_registrations")
        .select(
          "player_id, partner_id, partner:profiles!partner_id(display_name)"
        )
        .eq("tournament_id", tournamentId)
        .in("division", activeDivArr)
        .neq("status", "withdrawn")
    : { data: [] };
  const partnerByPrimary = new Map<string, string>();
  for (const r of (partnerRows ?? []) as any[]) {
    if (r.player_id && r.partner?.display_name) {
      partnerByPrimary.set(r.player_id, r.partner.display_name);
    }
  }
  function teamLabel(primaryId: string | null, primaryName: string | null): string {
    if (!primaryId) return primaryName ?? "TBD";
    const primary = primaryName ?? "TBD";
    const partner = partnerByPrimary.get(primaryId);
    return partner ? `${primary} / ${partner}` : primary;
  }

  const myQueueIndex = queue.findIndex(
    (m: any) =>
      m.player1_id === myTeamPrimaryId || m.player2_id === myTeamPrimaryId
  );

  // Court list — include open-court placeholders if numCourts is
  // set, so the layout mirrors the organizer's tracker and the
  // player can see "courts 3 and 5 are free".
  const occupiedByCourt = new Map<number, any>();
  for (const m of onCourt) {
    if (m.court_number != null) occupiedByCourt.set(m.court_number, m);
  }
  const courtCount =
    numCourts ??
    Math.max(0, ...onCourt.map((m: any) => m.court_number ?? 0));
  const courtsList =
    courtCount > 0
      ? Array.from({ length: courtCount }, (_, i) => ({
          court: i + 1,
          match: occupiedByCourt.get(i + 1) ?? null,
        }))
      : onCourt.map((m: any) => ({ court: m.court_number!, match: m }));

  // Range-aware sections: each owns its courts grid AND its queue.
  // Without ranges, one un-labelled section. With ranges, one
  // labelled section per range plus an "Other" catch-all for any
  // courts/queues not bound to a range. The section matching the
  // viewer's own range gets a subtle accent.
  const courtSections: {
    key: string;
    label: string | null;
    sublabel: string | null;
    isMine: boolean;
    courts: typeof courtsList;
    queue: typeof queue;
  }[] = (() => {
    if (!courtRanges || courtRanges.length === 0) {
      return [{
        key: "all",
        label: null as string | null,
        sublabel: null as string | null,
        isMine: false,
        courts: courtsList,
        queue,
      }];
    }
    const rangedCourts = new Set<number>();
    const rangedDivisions = new Set<string>();
    for (const r of courtRanges) {
      for (let c = r.court_start; c <= r.court_end; c++) rangedCourts.add(c);
      for (const d of r.divisions) rangedDivisions.add(d);
    }
    const sections: typeof courtSections = [];
    for (const r of courtRanges) {
      const cards = courtsList.filter(
        (c) => c.court >= r.court_start && c.court <= r.court_end
      );
      const rangeDivSet = new Set(r.divisions);
      const rangeQueue = queue.filter(
        (m: any) => m.division != null && rangeDivSet.has(m.division)
      );
      sections.push({
        key: r.id,
        label: `${r.label} · Courts ${r.court_start}–${r.court_end}`,
        sublabel:
          r.divisions.length > 0
            ? r.divisions.map((d) => getDivisionLabel(d)).join(" · ")
            : "No divisions assigned",
        isMine: !!myRangeId && r.id === myRangeId,
        courts: cards,
        queue: rangeQueue,
      });
    }
    const unrangedCards = courtsList.filter(
      (c) => !rangedCourts.has(c.court)
    );
    const unrangedQueue = queue.filter(
      (m: any) => m.division == null || !rangedDivisions.has(m.division)
    );
    if (unrangedCards.length > 0 || unrangedQueue.length > 0) {
      sections.push({
        key: "unranged",
        label:
          unrangedCards.length > 0
            ? `Other courts · ${unrangedCards.map((c) => c.court).join(", ")}`
            : "Unassigned divisions",
        sublabel: "Open to any unassigned division",
        isMine: !myRangeId,
        courts: unrangedCards,
        queue: unrangedQueue,
      });
    }
    return sections;
  })();

  return (
    <div className="space-y-3">
      {!embedded && (
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <h2 className="text-sm font-semibold text-dark-200">Court Tracker</h2>
          {myQueueIndex >= 0 ? (
            <p className="text-xs text-accent-300">
              You&apos;re <span className="font-semibold">{ordinal(myQueueIndex + 1)}</span> in line
              <span className="text-surface-muted"> of {queue.length}</span>
            </p>
          ) : queue.length > 0 ? (
            <p className="text-xs text-surface-muted">{queue.length} waiting</p>
          ) : null}
        </div>
      )}

      {/* Courts grid — same visual language as the organizer's
          Court Tracker, minus the action buttons. Scales to 3-4
          columns when there are a lot of courts so the section
          doesn't dominate the page. When the tournament defines
          court ranges, the grid splits into one labelled section
          per range and the viewer's own range gets a subtle accent. */}
      {courtsList.length > 0 && (
        <div className="space-y-3">
          {courtSections.map((section) => (
          <div key={section.key}>
            {section.label ? (
              <div
                className={
                  "mb-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-l-2 pl-3 " +
                  (section.isMine
                    ? "border-accent-400"
                    : "border-brand-500/60")
                }
              >
                <h4 className="text-[11px] font-semibold uppercase tracking-wide text-dark-100">
                  {section.label}
                </h4>
                {section.isMine && (
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-accent-300">
                    Your range
                  </span>
                )}
                {section.sublabel && (
                  <p className="text-[11px] text-surface-muted">
                    {section.sublabel}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-[11px] font-semibold uppercase tracking-wide text-surface-muted mb-1.5">
                Courts
              </p>
            )}
          <div
            className={
              "grid grid-cols-1 gap-2 sm:grid-cols-2 " +
              (section.courts.length > 10 ? "lg:grid-cols-3 xl:grid-cols-4" : "")
            }
          >
            {section.courts.map(({ court, match }) => {
              const includesMe =
                match &&
                (match.player1_id === myTeamPrimaryId ||
                  match.player2_id === myTeamPrimaryId);
              return (
                <div
                  key={court}
                  className={
                    "rounded-lg border shadow-sm " +
                    (courtsList.length > 10 ? "px-3 py-2" : "px-4 py-3") +
                    " " +
                    (match
                      ? includesMe
                        ? "border-accent-500/60 bg-accent-500/15"
                        : "border-brand-500/40 bg-brand-500/10"
                      : "border-surface-border bg-surface-overlay")
                  }
                >
                  <div className="flex items-center justify-between pb-2 border-b border-surface-border/60">
                    <p className="text-sm font-semibold text-dark-100">
                      Court {court}
                    </p>
                    <span
                      className={
                        "inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide " +
                        (match ? "text-brand-vivid" : "text-surface-muted")
                      }
                    >
                      {match && (
                        <span className="h-1.5 w-1.5 rounded-full bg-brand-vivid animate-pulse" />
                      )}
                      {match ? "Live" : "Open"}
                    </span>
                  </div>
                  {match ? (
                    <div className="mt-2 space-y-1.5">
                      <p className="text-sm text-dark-100 font-medium break-words flex items-center gap-1.5">
                        <span>{teamLabel(match.player1_id, match.player1?.display_name)}</span>
                        {firstChoiceMap?.get(match.id) === "team1" && (
                          <FirstChoiceBadge className="shrink-0" />
                        )}
                      </p>
                      <div className="flex items-center gap-2 text-[10px] text-surface-muted uppercase tracking-wide">
                        <span className="h-px flex-1 bg-surface-border" />
                        <span>vs</span>
                        <span className="h-px flex-1 bg-surface-border" />
                      </div>
                      <p className="text-sm text-dark-100 font-medium break-words flex items-center gap-1.5">
                        <span>{teamLabel(match.player2_id, match.player2?.display_name)}</span>
                        {firstChoiceMap?.get(match.id) === "team2" && (
                          <FirstChoiceBadge className="shrink-0" />
                        )}
                      </p>
                      <p className="text-xs text-surface-muted">
                        {getDivisionLabel(match.division)} · {labelFor(match)}
                      </p>
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-surface-muted">Waiting for the next match.</p>
                  )}
                </div>
              );
            })}
          </div>

          {/* Per-range Match Queue. Mirrors the organizer's Court
               Tracker layout so a player can scan all ranges, see how
               deep each queue is, and pick out their own row when it
               falls in their range. The viewer's range section already
               carries the accent border above. */}
          <div className="mt-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-surface-muted mb-1">
              Match Queue ({section.queue.length})
            </p>
            {section.queue.length === 0 ? (
              <p className="text-xs text-surface-muted">
                Nothing queued right now.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {section.queue.map((m: any, idx: number) => {
                  const includesMe =
                    m.player1_id === myTeamPrimaryId ||
                    m.player2_id === myTeamPrimaryId;
                  return (
                    <li
                      key={m.id}
                      className={
                        "flex items-center justify-between gap-3 rounded-md px-3 py-2 shadow-sm ring-1 " +
                        (includesMe
                          ? "bg-accent-500/10 ring-accent-500/40"
                          : "bg-surface-overlay ring-dark-500")
                      }
                    >
                      <div className="flex items-start gap-2 min-w-0 text-xs">
                        <span
                          className={
                            "shrink-0 font-semibold tabular-nums " +
                            (idx === 0
                              ? "text-accent-300"
                              : includesMe
                                ? "text-accent-300"
                                : "text-surface-muted")
                          }
                          aria-label={`Position ${idx + 1}`}
                        >
                          #{idx + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          {/* Stack teams vertically on mobile so long
                              doubles names don't wrap into a wall of
                              whitespace. From sm upward we keep the
                              original side-by-side grid. No first-choice
                              badge — that lives on the live court cards
                              + pool play bracket, not on queue rows. */}
                          <div className="flex flex-col gap-1 sm:grid sm:grid-cols-[1fr_auto_1fr] sm:items-center sm:gap-2">
                            <p className="text-dark-100 break-words min-w-0 sm:text-left">
                              {teamLabel(m.player1_id, m.player1?.display_name)}
                            </p>
                            <span className="text-[10px] text-surface-muted uppercase tracking-wide sm:self-center">vs</span>
                            <p className="text-dark-100 break-words min-w-0 sm:text-right">
                              {teamLabel(m.player2_id, m.player2?.display_name)}
                            </p>
                          </div>
                          <p className="text-surface-muted mt-1">
                            {getDivisionLabel(m.division)} · {labelFor(m)}
                          </p>
                        </div>
                      </div>
                      {idx === 0 && (
                        <span className="text-[11px] font-semibold text-accent-300 whitespace-nowrap">
                          Up next
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}
