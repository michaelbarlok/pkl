import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

const PCT_WINDOW_SESSIONS = 14;

/**
 * Calculate each player's points percentage:
 * Per session: total points scored / max possible points (winning score per game).
 * Averaged over the last 14 sessions.
 */
async function getPlayerPercentages(supabase: Awaited<ReturnType<typeof createClient>>) {
  // Get all completed sessions ordered by date
  const { data: sessions } = await supabase
    .from("shootout_sessions")
    .select("id, created_at")
    .eq("status", "session_complete")
    .order("created_at", { ascending: false });

  if (!sessions || sessions.length === 0) return new Map<string, number>();

  const sessionIds = sessions.map((s: { id: string }) => s.id);

  // Get all participants to know which players were in which sessions
  const { data: participants } = await supabase
    .from("session_participants")
    .select("session_id, player_id")
    .in("session_id", sessionIds);

  // Get all game results for these sessions
  const { data: games } = await supabase
    .from("game_results")
    .select("session_id, team_a_p1, team_a_p2, team_b_p1, team_b_p2, score_a, score_b")
    .in("session_id", sessionIds);

  if (!participants || !games) return new Map<string, number>();

  // Build a map: playerId -> ordered list of session IDs they participated in
  const playerSessions = new Map<string, string[]>();
  for (const p of participants) {
    const list = playerSessions.get(p.player_id) ?? [];
    if (!list.includes(p.session_id)) list.push(p.session_id);
    playerSessions.set(p.player_id, list);
  }

  // Index games by session
  const gamesBySession = new Map<string, typeof games>();
  for (const g of games) {
    const list = gamesBySession.get(g.session_id) ?? [];
    list.push(g);
    gamesBySession.set(g.session_id, list);
  }

  // For each player, compute average percentage over last 14 sessions
  const percentages = new Map<string, number>();

  for (const [playerId, sessList] of playerSessions) {
    // Sessions are already ordered by date desc from the query; take last 14
    const recentSessions = sessList.slice(0, PCT_WINDOW_SESSIONS);
    const sessionPcts: number[] = [];

    for (const sessId of recentSessions) {
      const sessGames = gamesBySession.get(sessId) ?? [];
      let totalScored = 0;
      let totalMax = 0;

      for (const g of sessGames) {
        const onTeamA =
          g.team_a_p1 === playerId || g.team_a_p2 === playerId;
        const onTeamB =
          g.team_b_p1 === playerId || g.team_b_p2 === playerId;

        if (!onTeamA && !onTeamB) continue;

        const playerScore = onTeamA ? g.score_a : g.score_b;
        const maxScore = Math.max(g.score_a, g.score_b);

        totalScored += playerScore;
        totalMax += maxScore;
      }

      if (totalMax > 0) {
        sessionPcts.push(totalScored / totalMax);
      }
    }

    if (sessionPcts.length > 0) {
      const avg =
        sessionPcts.reduce((sum, p) => sum + p, 0) / sessionPcts.length;
      percentages.set(playerId, Math.round(avg * 1000) / 10); // e.g. 75.3%
    }
  }

  return percentages;
}

export default async function RatingsPage() {
  const supabase = await createClient();

  // Get all active players with their group memberships (for current_step)
  const { data: memberships } = await supabase
    .from("group_memberships")
    .select("player_id, current_step, last_played_at, player:profiles(id, display_name, avatar_url, is_active)")
    .order("current_step", { ascending: true });

  // Calculate point percentages
  const percentages = await getPlayerPercentages(supabase);

  // Deduplicate players: use their best (lowest) step across groups
  const playerMap = new Map<
    string,
    {
      player_id: string;
      current_step: number;
      display_name: string;
      avatar_url: string | null;
      percentage: number;
      last_played_at: string | null;
    }
  >();

  for (const m of memberships ?? []) {
    const player = m.player as any;
    if (!player?.is_active) continue;

    const existing = playerMap.get(m.player_id);
    const pct = percentages.get(m.player_id) ?? 0;

    if (!existing || m.current_step < existing.current_step) {
      playerMap.set(m.player_id, {
        player_id: m.player_id,
        current_step: m.current_step,
        display_name: player.display_name,
        avatar_url: player.avatar_url,
        percentage: pct,
        last_played_at: (m as any).last_played_at ?? null,
      });
    }
  }

  // Sort by step (asc), then percentage (desc)
  const ranked = Array.from(playerMap.values()).sort((a, b) => {
    if (a.current_step !== b.current_step)
      return a.current_step - b.current_step;
    return b.percentage - a.percentage;
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-dark-100">Rankings</h1>
        <p className="text-sm text-surface-muted">
          Player rankings by step and scoring percentage (last {PCT_WINDOW_SESSIONS} sessions)
        </p>
      </div>

      <div className="card overflow-hidden p-0">
        <table className="min-w-full divide-y divide-surface-border">
          <thead className="bg-surface-overlay">
            <tr>
              <th className="px-2 sm:px-4 py-3 text-left text-xs font-medium uppercase text-surface-muted w-10 sm:w-16">Rank</th>
              <th className="px-2 sm:px-4 py-3 text-left text-xs font-medium uppercase text-surface-muted">Player</th>
              <th className="px-2 sm:px-4 py-3 text-left text-xs font-medium uppercase text-surface-muted">Step</th>
              <th className="px-2 sm:px-4 py-3 text-left text-xs font-medium uppercase text-surface-muted">Pct</th>
              <th className="px-2 sm:px-4 py-3 text-left text-xs font-medium uppercase text-surface-muted">Last Played</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border bg-surface-raised">
            {ranked.map((r, i) => (
              <tr key={r.player_id}>
                <td className="whitespace-nowrap px-2 sm:px-4 py-3 sm:py-4 text-sm font-medium text-surface-muted">
                  {i + 1}
                </td>
                <td className="whitespace-nowrap px-2 sm:px-4 py-3 sm:py-4">
                  <Link href={`/players/${r.player_id}`} className="flex items-center gap-2 sm:gap-3 hover:text-brand-600">
                    {r.avatar_url ? (
                      <img src={r.avatar_url} alt="" className="h-7 w-7 sm:h-8 sm:w-8 rounded-full object-cover" />
                    ) : (
                      <div className="flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-full bg-brand-900/50 text-brand-300 text-xs sm:text-sm font-medium">
                        {r.display_name?.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span className="text-sm font-medium text-dark-100">
                      {r.display_name}
                    </span>
                  </Link>
                </td>
                <td className="whitespace-nowrap px-2 sm:px-4 py-3 sm:py-4">
                  <span className="inline-flex items-center rounded-md bg-brand-900/40 px-2 py-1 text-sm font-semibold text-brand-300">
                    {r.current_step}
                  </span>
                </td>
                <td className="whitespace-nowrap px-2 sm:px-4 py-3 sm:py-4 text-sm text-dark-200">
                  {r.percentage > 0 ? `${r.percentage.toFixed(1)}%` : "—"}
                </td>
                <td className="whitespace-nowrap px-2 sm:px-4 py-3 sm:py-4 text-sm text-surface-muted">
                  {r.last_played_at
                    ? new Date(r.last_played_at).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })
                    : "—"}
                </td>
              </tr>
            ))}
            {ranked.length === 0 && (
              <tr>
                <td colSpan={5} className="px-2 sm:px-4 py-8 text-center text-surface-muted">
                  No ranked players yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
