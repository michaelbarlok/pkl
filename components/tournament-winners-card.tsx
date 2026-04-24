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
        const finalMatch = playoff.find(
          (m: any) => m.round === maxRound && m.match_number === 1
        ) as any;
        const thirdMatch = playoff.find(
          (m: any) => m.round === maxRound && m.match_number === 2
        ) as any;

        if (finalMatch?.status === "completed" && finalMatch.winner_id) {
          first = { name: nameFor(finalMatch.winner_id) };
          const runnerUp =
            finalMatch.player1_id === finalMatch.winner_id
              ? finalMatch.player2_id
              : finalMatch.player1_id;
          if (runnerUp) second = { name: nameFor(runnerUp) };
        }
        if (thirdMatch?.status === "completed" && thirdMatch.winner_id) {
          third = { name: nameFor(thirdMatch.winner_id) };
        }
      }

      return { division: div, first, second, third };
    })
    .filter((r) => r.first !== null);

  if (results.length === 0) return null;

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
