import { createClient } from "@/lib/supabase/server";
import { getDivisionLabel } from "@/lib/divisions";

interface Props {
  tournamentId: string;
  /** The viewer's team primary — matches tournament_matches.player1_id /
   *  player2_id. Used to highlight the viewer's team in the queue. */
  myTeamPrimaryId: string;
  myDivision: string;
  /** Drop the internal header + position summary because the
   *  caller's already rendering those in the surrounding collapsible
   *  card. */
  embedded?: boolean;
}

/**
 * Full FIFO match queue rendered for players on the live tournament
 * view. Each row shows position in line, team names, division, and
 * round. The viewer's team row is accent-highlighted and the card
 * header surfaces "You're Nth in line" so the player sees how far
 * away their next match is at a glance.
 *
 * Currently on-court matches for the viewer's division are shown
 * above the queue as context (who's playing right now in their
 * division). Rows across all active divisions appear in the queue
 * — players want to see total activity, not just their pool.
 */
export async function NextUpQueue({
  tournamentId,
  myTeamPrimaryId,
  myDivision,
  embedded = false,
}: Props) {
  const supabase = await createClient();

  const { data: activeDivs } = await supabase
    .from("tournament_active_divisions")
    .select("division")
    .eq("tournament_id", tournamentId);
  const activeSet = new Set((activeDivs ?? []).map((r: any) => r.division));

  // Strict FIFO — staggered queue_entered_at written at enqueue
  // time, we just sort ASC here.
  const { data: matchesRaw } = await supabase
    .from("tournament_matches")
    .select(
      "id, division, round, match_number, bracket, court_number, queue_entered_at, player1_id, player2_id, player1:profiles!player1_id(display_name), player2:profiles!player2_id(display_name)"
    )
    .eq("tournament_id", tournamentId)
    .is("court_number", null)
    .eq("status", "pending")
    .not("queue_entered_at", "is", null)
    .order("queue_entered_at", { ascending: true })
    .limit(200);

  const queue = (matchesRaw ?? []).filter(
    (m: any) => m.division && activeSet.has(m.division)
  );

  // Pull partner names for every active-division registration so
  // each queue row can show "Primary / Partner" instead of just the
  // primary's display name.
  const activeDivArr = Array.from(activeSet) as string[];
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

  // Currently on-court matches scoped to the viewer's division —
  // ambient context above the queue. The MyCourtCard up top already
  // shows the viewer's OWN court if they have one; this list fills
  // in the other courts in their division.
  const { data: onCourtRaw } = await supabase
    .from("tournament_matches")
    .select(
      "id, division, round, match_number, bracket, court_number, player1_id, player2_id, player1:profiles!player1_id(display_name), player2:profiles!player2_id(display_name)"
    )
    .eq("tournament_id", tournamentId)
    .eq("division", myDivision)
    .not("court_number", "is", null)
    .eq("status", "pending")
    .order("court_number", { ascending: true });

  const onCourt = (onCourtRaw ?? []) as any[];

  return (
    <div className="space-y-2">
      {!embedded && (
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <h2 className="text-sm font-semibold text-dark-200">Match queue</h2>
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

      {onCourt.length > 0 && (
        <ul className="space-y-1.5">
          {onCourt.map((m) => (
            <li
              key={m.id}
              className="card flex items-center justify-between gap-3 border border-brand-500/40 bg-brand-500/10"
            >
              <div className="text-xs min-w-0">
                <p className="text-dark-100 font-medium truncate">
                  {teamLabel(m.player1_id, m.player1?.display_name)}
                  <span className="text-surface-muted"> vs </span>
                  {teamLabel(m.player2_id, m.player2?.display_name)}
                </p>
                <p className="text-surface-muted">
                  {getDivisionLabel(m.division)} · Round {m.round}
                </p>
              </div>
              <span className="text-xs font-semibold text-brand-vivid whitespace-nowrap">
                On Court {m.court_number}
              </span>
            </li>
          ))}
        </ul>
      )}

      {queue.length === 0 ? (
        <p className="text-xs text-surface-muted">
          No matches queued. Once a current match wraps up, the next one will appear here.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {queue.map((m: any, idx: number) => {
            const includesMe =
              m.player1_id === myTeamPrimaryId ||
              m.player2_id === myTeamPrimaryId;
            return (
              <li
                key={m.id}
                className={
                  "flex items-center justify-between gap-3 rounded-md px-3 py-2 " +
                  (includesMe
                    ? "bg-accent-500/10 ring-1 ring-accent-500/40"
                    : "bg-surface-overlay")
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
                  <div className="min-w-0">
                    <p className="text-dark-100 truncate">
                      {teamLabel(m.player1_id, m.player1?.display_name)}
                      <span className="text-surface-muted"> vs </span>
                      {teamLabel(m.player2_id, m.player2?.display_name)}
                    </p>
                    <p className="text-surface-muted">
                      {getDivisionLabel(m.division)} · Round {m.round}
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
  );
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}
