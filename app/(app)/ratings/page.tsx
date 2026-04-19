import { createClient } from "@/lib/supabase/server";
import { RatingsTable, type RankedPlayer } from "./ratings-table";

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
  const playerMap = new Map<string, RankedPlayer>();

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
        <h1 className="text-heading">Rankings</h1>
        <p className="mt-1 text-sm text-surface-muted">
          Player rankings by step and scoring percentage (last {PCT_WINDOW_SESSIONS} sessions)
        </p>
      </div>
      <RatingsTable ranked={ranked} />
    </div>
  );
}
