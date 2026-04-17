import { getTournament, getTournamentRegistrations, getTournamentMatches } from "@/lib/queries/tournament";
import { DivisionBrackets } from "../division-brackets";
import type { PartnerMap } from "@/components/tournament-bracket";
import { formatDate, formatTime } from "@/lib/utils";
import Link from "next/link";
import { notFound } from "next/navigation";

export default async function PublicBracketPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [tournament, registrations, matches] = await Promise.all([
    getTournament(id),
    getTournamentRegistrations(id),
    getTournamentMatches(id),
  ]);

  if (!tournament || (tournament as any).is_hidden) notFound();

  const confirmedRegistrations = registrations.filter((r) => r.status === "confirmed");

  const partnerMap: PartnerMap = new Map();
  if (tournament.type === "doubles") {
    for (const reg of confirmedRegistrations) {
      const r = reg as any;
      if (r.player_id && r.partner?.display_name) {
        partnerMap.set(r.player_id, r.partner.display_name);
      }
    }
  }

  // Group matches by division in tournament.divisions order
  const divisionMatchesMap = new Map<string, typeof matches>();
  for (const m of matches) {
    const div = (m as any).division ?? "__none__";
    if (!divisionMatchesMap.has(div)) divisionMatchesMap.set(div, []);
    divisionMatchesMap.get(div)!.push(m);
  }
  const divOrder = (tournament.divisions ?? []) as string[];
  const divisionMatchesEntries: { division: string; matches: typeof matches }[] = [];
  for (const code of divOrder) {
    if (divisionMatchesMap.has(code)) {
      divisionMatchesEntries.push({ division: code, matches: divisionMatchesMap.get(code)! });
      divisionMatchesMap.delete(code);
    }
  }
  for (const [key, val] of divisionMatchesMap) {
    divisionMatchesEntries.push({ division: key, matches: val });
  }

  return (
    <div className="max-w-3xl lg:max-w-6xl mx-auto space-y-6 py-6 px-4 sm:px-6">
      {/* Header */}
      <div>
        <Link
          href={`/tournaments/${id}`}
          className="text-sm text-surface-muted hover:text-dark-200 transition-colors mb-3 inline-block"
        >
          ← View tournament details
        </Link>
        <h1 className="text-2xl font-bold text-dark-100">{tournament.title}</h1>
        <p className="text-sm text-surface-muted mt-1">
          {formatDate(tournament.start_date + "T00:00:00")}
          {tournament.start_time && <> &middot; {formatTime(tournament.start_time)}</>}
          {tournament.location && <> &middot; {tournament.location}</>}
        </p>
        <p className="text-xs text-surface-muted mt-1">
          {tournament.type === "doubles" ? "Doubles" : "Singles"} &middot;{" "}
          {tournament.format === "round_robin"
            ? "Round Robin"
            : tournament.format === "single_elimination"
            ? "Single Elimination"
            : "Double Elimination"}
        </p>
      </div>

      {/* Bracket */}
      {matches.length === 0 ? (
        <div className="card card-static text-center py-10">
          <p className="text-surface-muted">The bracket hasn&apos;t been generated yet.</p>
          <p className="text-xs text-surface-muted mt-1">Check back closer to the tournament date.</p>
        </div>
      ) : (
        <DivisionBrackets
          divisionMatchesEntries={divisionMatchesEntries}
          tournament={{
            format: tournament.format,
            score_to_win_pool: (tournament as any).score_to_win_pool ?? undefined,
            score_to_win_playoff: (tournament as any).score_to_win_playoff ?? undefined,
            finals_best_of_3: (tournament as any).finals_best_of_3 ?? undefined,
          }}
          canManage={false}
          tournamentId={id}
          partnerMap={partnerMap}
          isRoundRobin={tournament.format === "round_robin"}
        />
      )}
    </div>
  );
}
