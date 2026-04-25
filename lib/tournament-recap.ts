/**
 * End-of-tournament recap generator.
 *
 * Builds a per-division results summary that the "tournament complete"
 * email consumes in two flavors:
 *   - Player: full standings for their own division + top-3 for every
 *     other division.
 *   - Organizer: full standings + playoff results for every division.
 *
 * The heavy lifting lives here so the endpoint route and the email
 * template stay thin.
 */

import { createServiceClient } from "@/lib/supabase/server";
import {
  computePoolStandings,
  getPoolBrackets,
} from "@/lib/tournament-bracket";
import { getDivisionLabel } from "@/lib/divisions";

export interface RecapStanding {
  playerId: string;
  displayName: string;
  partnerName: string | null;
  wins: number;
  losses: number;
  pointDiff: number;
}

export interface RecapPlayoffPlacement {
  place: number;
  playerId: string;
  displayName: string;
  partnerName: string | null;
}

export interface DivisionRecap {
  division: string;
  label: string;
  poolStandings: RecapStanding[];
  playoffPlacements: RecapPlayoffPlacement[];
}

export interface TournamentRecap {
  tournamentId: string;
  title: string;
  format: string;
  divisions: DivisionRecap[];
}

export async function computeTournamentRecap(
  tournamentId: string
): Promise<TournamentRecap | null> {
  const service = await createServiceClient();

  const { data: tournament } = await service
    .from("tournaments")
    .select("id, title, format, divisions")
    .eq("id", tournamentId)
    .single();
  if (!tournament) return null;

  const [{ data: matches }, { data: regs }, { data: profiles }] =
    await Promise.all([
      service
        .from("tournament_matches")
        .select(
          "id, division, bracket, round, match_number, player1_id, player2_id, winner_id, score1, score2, status"
        )
        .eq("tournament_id", tournamentId),
      service
        .from("tournament_registrations")
        .select("player_id, partner_id, division, status")
        .eq("tournament_id", tournamentId)
        .neq("status", "withdrawn"),
      service.from("profiles").select("id, display_name"),
    ]);

  const profileName = new Map<string, string>();
  for (const p of profiles ?? []) profileName.set(p.id, p.display_name ?? "Player");

  const partnerById = new Map<string, string | null>();
  for (const r of (regs ?? []) as any[]) {
    if (r.player_id) {
      partnerById.set(
        r.player_id,
        r.partner_id ? profileName.get(r.partner_id) ?? null : null
      );
    }
  }

  function nameFor(playerId: string): string {
    return profileName.get(playerId) ?? "Player";
  }
  function partnerFor(playerId: string): string | null {
    return partnerById.get(playerId) ?? null;
  }

  const divisionSet = new Set<string>();
  for (const m of matches ?? []) {
    if ((m as any).division) divisionSet.add((m as any).division);
  }
  // Also include tournament.divisions so divisions with no generated
  // bracket still show up (empty) in the recap order.
  for (const d of (tournament.divisions ?? []) as string[]) divisionSet.add(d);

  const divisions: DivisionRecap[] = [];
  const orderedList = [
    ...((tournament.divisions ?? []) as string[]).filter((d) => divisionSet.has(d)),
    ...Array.from(divisionSet).filter(
      (d) => !((tournament.divisions ?? []) as string[]).includes(d)
    ),
  ];

  for (const division of orderedList) {
    const divMatches = (matches ?? []).filter(
      (m: any) => m.division === division
    );

    // Pool-play standings from everything that's NOT the playoff bracket.
    const poolMatches = divMatches.filter(
      (m: any) => m.bracket !== "playoff"
    );

    const standings = computePoolStandings(
      poolMatches.map((m: any) => ({
        player1_id: m.player1_id,
        player2_id: m.player2_id,
        winner_id: m.winner_id,
        score1: m.score1 ?? [],
        score2: m.score2 ?? [],
        status: m.status,
      }))
    );

    const poolStandings: RecapStanding[] = standings.map((s) => ({
      playerId: s.id,
      displayName: nameFor(s.id),
      partnerName: partnerFor(s.id),
      wins: s.wins,
      losses: s.losses,
      pointDiff: s.pointDiff,
    }));

    // Playoff placements. For single-elimination playoff (or an
    // elimination-format tournament), we can derive:
    //   1st — winner of the final
    //   2nd — loser of the final
    //   3rd — winner of the 3rd-place match (by convention match_number 2
    //         of the last round). If no explicit 3rd-place game, leave
    //         the bronze slot empty.
    const playoffMatches = divMatches
      .filter((m: any) => m.bracket === "playoff" || divMatches.every((x: any) => x.bracket !== "playoff"))
      .filter((m: any) => m.bracket === "playoff");

    const placements: RecapPlayoffPlacement[] = [];
    if (playoffMatches.length > 0) {
      const maxRound = Math.max(...playoffMatches.map((m: any) => m.round));
      // Best-of-3 finals split the championship into multiple game
      // rows (all match_number=1 in maxRound). Aggregate game wins
      // to find the series winner; first-to-2 wins the series.
      const finalRows = playoffMatches.filter(
        (m: any) => m.round === maxRound && m.match_number === 1
      );
      const thirdPlaceMatch = playoffMatches.find(
        (m: any) => m.round === maxRound && m.match_number === 2
      );

      let seriesWinnerId: string | null = null;
      let seriesRunnerUpId: string | null = null;
      if (finalRows.length === 1) {
        const f = finalRows[0] as any;
        if (f.winner_id) {
          seriesWinnerId = f.winner_id;
          seriesRunnerUpId =
            f.player1_id === f.winner_id ? f.player2_id : f.player1_id;
        }
      } else if (finalRows.length > 1) {
        const wins = new Map<string, number>();
        for (const r of finalRows as any[]) {
          if (r.winner_id) {
            wins.set(r.winner_id, (wins.get(r.winner_id) ?? 0) + 1);
          }
        }
        for (const [id, w] of wins) {
          if (w >= 2) {
            seriesWinnerId = id;
            const sample = finalRows[0] as any;
            seriesRunnerUpId =
              sample.player1_id === id ? sample.player2_id : sample.player1_id;
            break;
          }
        }
      }

      if (seriesWinnerId) {
        placements.push({
          place: 1,
          playerId: seriesWinnerId,
          displayName: nameFor(seriesWinnerId),
          partnerName: partnerFor(seriesWinnerId),
        });
        if (seriesRunnerUpId) {
          placements.push({
            place: 2,
            playerId: seriesRunnerUpId,
            displayName: nameFor(seriesRunnerUpId),
            partnerName: partnerFor(seriesRunnerUpId),
          });
        }
      }
      if (thirdPlaceMatch?.winner_id) {
        placements.push({
          place: 3,
          playerId: thirdPlaceMatch.winner_id,
          displayName: nameFor(thirdPlaceMatch.winner_id),
          partnerName: partnerFor(thirdPlaceMatch.winner_id),
        });
      }
    } else if (poolStandings.length > 0) {
      // No playoff bracket — top of pool standings is effectively the
      // final order. Use the top 3.
      const top = poolStandings.slice(0, 3);
      for (let i = 0; i < top.length; i++) {
        placements.push({
          place: i + 1,
          playerId: top[i].playerId,
          displayName: top[i].displayName,
          partnerName: top[i].partnerName,
        });
      }
    }

    divisions.push({
      division,
      label: getDivisionLabel(division),
      poolStandings,
      playoffPlacements: placements,
    });
  }

  return {
    tournamentId: tournament.id,
    title: tournament.title,
    format: tournament.format,
    divisions,
  };
}
