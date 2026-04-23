import { createClient } from "@/lib/supabase/server";
import { getDivisionLabel } from "@/lib/divisions";

interface Props {
  tournamentId: string;
  myPlayerId: string;
  myDivision: string;
}

/**
 * "Next 3 matches" widget rendered at the bottom of the live view.
 * Pulls the top of the queue across every currently-active division
 * in the tournament (not just the viewer's) so players can see how
 * close they are to being up.
 *
 * A viewer whose team is in one of those three gets a subtle
 * highlight. The actual "up next" push notification is fired by the
 * court-assignment engine in Phase 5 — this widget is just the
 * ambient signal players can scroll to at any time.
 */
export async function NextUpQueue({
  tournamentId,
  myPlayerId,
  myDivision,
}: Props) {
  const supabase = await createClient();

  // Only active divisions feed the queue.
  const { data: activeDivs } = await supabase
    .from("tournament_active_divisions")
    .select("division")
    .eq("tournament_id", tournamentId);
  const activeSet = new Set((activeDivs ?? []).map((r: any) => r.division));

  // Top-of-queue = queued, not on a court, oldest queue_entered_at
  // first. The assignment engine sets court_number when a match gets
  // handed to a court; those no longer appear here. BYE rows have
  // no queue_entered_at and never surface in the widget.
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
    .limit(25);

  const queue = (matchesRaw ?? []).filter(
    (m: any) => m.division && activeSet.has(m.division)
  );
  const top3 = queue.slice(0, 3);

  // Also surface the currently-on-court match for the viewer's
  // division if one exists — helpful context right above the queue.
  const { data: onCourtRaw } = await supabase
    .from("tournament_matches")
    .select(
      "id, division, round, match_number, bracket, court_number, player1:profiles!player1_id(display_name), player2:profiles!player2_id(display_name)"
    )
    .eq("tournament_id", tournamentId)
    .eq("division", myDivision)
    .not("court_number", "is", null)
    .eq("status", "pending")
    .order("court_number", { ascending: true });

  const onCourt = (onCourtRaw ?? []) as any[];

  return (
    <div className="space-y-2">
      <h2 className="text-sm font-semibold text-dark-200">Up next</h2>

      {onCourt.length > 0 && (
        <ul className="space-y-1.5">
          {onCourt.map((m) => (
            <li
              key={m.id}
              className="card flex items-center justify-between gap-3 border border-brand-500/40 bg-brand-500/10"
            >
              <div className="text-xs">
                <p className="text-dark-100 font-medium">
                  {m.player1?.display_name ?? "TBD"} vs {m.player2?.display_name ?? "TBD"}
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

      {top3.length === 0 ? (
        <p className="text-xs text-surface-muted">
          No matches queued. Once a current match wraps up, the next one will appear here.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {top3.map((m: any, idx: number) => {
            const includesMe =
              m.player1_id === myPlayerId || m.player2_id === myPlayerId;
            return (
              <li
                key={m.id}
                className={
                  "card flex items-center justify-between gap-3 " +
                  (includesMe
                    ? "border border-accent-500/40 bg-accent-500/10"
                    : "")
                }
              >
                <div className="text-xs">
                  <p className="text-dark-100 font-medium">
                    {m.player1?.display_name ?? "TBD"} vs {m.player2?.display_name ?? "TBD"}
                  </p>
                  <p className="text-surface-muted">
                    {getDivisionLabel(m.division)} · Round {m.round}
                  </p>
                </div>
                <span
                  className={
                    "text-xs font-semibold whitespace-nowrap " +
                    (idx === 0
                      ? "text-accent-300"
                      : "text-surface-muted")
                  }
                >
                  {idx === 0 ? "Up next" : `In ${idx + 1}`}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
