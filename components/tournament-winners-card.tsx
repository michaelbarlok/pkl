import { getDivisionLabel } from "@/lib/divisions";
import type { TournamentMatch } from "@/types/database";
import type { PartnerMap } from "@/components/tournament-bracket";
import { tournamentHeroGradient } from "@/lib/tournament-hero";

interface Props {
  tournamentId: string;
  /** Divisions in tournament.divisions order so cards render
   *  the same way for everyone. */
  divisions: string[];
  /** All tournament matches already joined with player/partner
   *  profiles; this component only reads playoff rows. */
  matches: TournamentMatch[];
  partnerMap?: PartnerMap;
}

interface Placement {
  name: string;
}

/**
 * Top-of-page "who won" card rendered on completed tournaments.
 * One tile per division showing 🥇 / 🥈 / 🥉 so at first glance
 * anyone landing on the page — players, organizers, spectators —
 * sees every division's podium without having to click into the
 * bracket tabs. Falls back to nothing when a division never
 * generated a playoff final (e.g. too few teams, in which case
 * the organizer would have used pool standings as the final).
 *
 * Pure server component — relies on the matches + partner map
 * the tournament detail page already fetched so there's no
 * second round-trip.
 */
export function TournamentWinnersCard({
  tournamentId,
  divisions,
  matches,
  partnerMap,
}: Props) {
  const nameFor = (id: string | null): string => {
    if (!id) return "TBD";
    const m = matches.find(
      (x: any) =>
        x.player1_id === id || x.player2_id === id || x.winner_id === id
    ) as any;
    const p1 =
      m?.player1?.display_name && m.player1_id === id
        ? m.player1.display_name
        : null;
    const p2 =
      m?.player2?.display_name && m.player2_id === id
        ? m.player2.display_name
        : null;
    const primary = p1 ?? p2 ?? "Player";
    const partner = partnerMap?.get(id);
    return partner ? `${primary} / ${partner}` : primary;
  };

  const results = divisions
    .map((div) => {
      const divMatches = (matches ?? []).filter(
        (m: any) => m.division === div
      );
      const playoff = divMatches.filter((m: any) => m.bracket === "playoff");

      let first: Placement | null = null;
      let second: Placement | null = null;
      let third: Placement | null = null;

      if (playoff.length > 0) {
        const maxRound = Math.max(...playoff.map((m: any) => m.round));
        // Final = every match_number 1 row in the max round.
        // Best-of-3 finals can have up to 3 rows (one per game);
        // single-game finals have exactly 1.
        const finalRows = playoff.filter(
          (m: any) => m.round === maxRound && m.match_number === 1
        );
        const thirdMatch = playoff.find(
          (m: any) => m.round === maxRound && m.match_number === 2
        ) as any;

        const seriesResult = resolveSeriesWinner(finalRows);
        if (seriesResult) {
          first = { name: nameFor(seriesResult.winnerId) };
          if (seriesResult.runnerUpId) {
            second = { name: nameFor(seriesResult.runnerUpId) };
          }
        }
        if (thirdMatch?.status === "completed" && thirdMatch.winner_id) {
          third = { name: nameFor(thirdMatch.winner_id) };
        }
      }

      return { division: div, first, second, third };
    })
    .filter((r) => r.first !== null);

  if (results.length === 0) return null;

  // -- inline because winners-card is server-only and we don't have
  // a shared utils file for tournament playoff helpers right now.
  function resolveSeriesWinner(
    finalRows: any[]
  ): { winnerId: string; runnerUpId: string | null } | null {
    if (finalRows.length === 0) return null;
    // Single-game final: just look at the single completed row.
    if (finalRows.length === 1) {
      const f = finalRows[0];
      if (f.status !== "completed" || !f.winner_id) return null;
      const runnerUp =
        f.player1_id === f.winner_id ? f.player2_id : f.player1_id;
      return { winnerId: f.winner_id, runnerUpId: runnerUp ?? null };
    }
    // Best-of-3: tally game wins per team. Series winner = first to 2.
    const wins = new Map<string, number>();
    for (const r of finalRows) {
      if (r.status === "completed" && r.winner_id) {
        wins.set(r.winner_id, (wins.get(r.winner_id) ?? 0) + 1);
      }
    }
    let seriesWinner: string | null = null;
    for (const [id, w] of wins) {
      if (w >= 2) {
        seriesWinner = id;
        break;
      }
    }
    if (!seriesWinner) return null;
    // Runner-up is the OTHER team in the series — pulled from any
    // game row's two players (they're stable across games).
    const sample = finalRows[0];
    const runnerUp =
      sample.player1_id === seriesWinner
        ? sample.player2_id
        : sample.player1_id;
    return { winnerId: seriesWinner, runnerUpId: runnerUp ?? null };
  }

  const heroTint = tournamentHeroGradient(tournamentId);

  return (
    <div
      className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${heroTint} ring-1 ring-surface-border p-5 sm:p-6`}
    >
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xl" aria-hidden>
          🏆
        </span>
        <h2 className="text-base font-semibold text-dark-100 tracking-tight">
          Final results
        </h2>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {results.map(({ division, first, second, third }) => (
          <div
            key={division}
            className="rounded-xl bg-surface-raised/90 ring-1 ring-surface-border p-4 space-y-2"
          >
            <p className="text-xs font-semibold uppercase tracking-wider text-dark-200">
              {getDivisionLabel(division)}
            </p>
            <div className="space-y-1.5">
              {first && (
                <div className="flex items-center gap-2">
                  <span className="text-lg" aria-label="1st place">
                    🥇
                  </span>
                  <span className="text-sm font-semibold text-dark-100 break-words">
                    {first.name}
                  </span>
                </div>
              )}
              {second && (
                <div className="flex items-center gap-2">
                  <span className="text-lg" aria-label="2nd place">
                    🥈
                  </span>
                  <span className="text-sm text-dark-200 break-words">
                    {second.name}
                  </span>
                </div>
              )}
              {third && (
                <div className="flex items-center gap-2">
                  <span className="text-lg" aria-label="3rd place">
                    🥉
                  </span>
                  <span className="text-sm text-dark-200 break-words">
                    {third.name}
                  </span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
