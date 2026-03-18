/**
 * Badge Checking Engine
 *
 * Evaluates badge criteria for a player and awards any newly earned badges.
 * Called after key events: game completion, group join, forum post, etc.
 */

import { createServiceClient } from "@/lib/supabase/server";
import { notify } from "@/lib/notify";
import type { BadgeCategory } from "@/types/database";

// ============================================================
// Badge criteria definitions
// ============================================================

interface BadgeCriteria {
  code: string;
  category: BadgeCategory;
  /** Returns true if the player has met the criteria for this badge */
  check: (ctx: PlayerContext) => boolean;
}

interface PlayerContext {
  playerId: string;
  totalGames: number;
  totalWins: number;
  currentWinStreak: number;
  displayRating: number | null;
  groupCount: number;
  forumPostCount: number;
  tournamentCount: number;
  tournamentWins: number;
  bestStep: number | null; // lowest step number (1 = best)
}

const BADGE_CRITERIA: BadgeCriteria[] = [
  // Play milestones
  { code: "first_game", category: "play", check: (ctx) => ctx.totalGames >= 1 },
  { code: "games_10", category: "play", check: (ctx) => ctx.totalGames >= 10 },
  { code: "games_50", category: "play", check: (ctx) => ctx.totalGames >= 50 },
  { code: "games_100", category: "play", check: (ctx) => ctx.totalGames >= 100 },
  { code: "games_500", category: "play", check: (ctx) => ctx.totalGames >= 500 },

  // Winning
  { code: "first_win", category: "winning", check: (ctx) => ctx.totalWins >= 1 },
  { code: "wins_10", category: "winning", check: (ctx) => ctx.totalWins >= 10 },
  { code: "wins_50", category: "winning", check: (ctx) => ctx.totalWins >= 50 },
  { code: "win_streak_3", category: "winning", check: (ctx) => ctx.currentWinStreak >= 3 },
  { code: "win_streak_5", category: "winning", check: (ctx) => ctx.currentWinStreak >= 5 },
  { code: "win_streak_10", category: "winning", check: (ctx) => ctx.currentWinStreak >= 10 },

  // Rating
  { code: "rating_3_0", category: "rating", check: (ctx) => (ctx.displayRating ?? 0) >= 3.0 },
  { code: "rating_3_5", category: "rating", check: (ctx) => (ctx.displayRating ?? 0) >= 3.5 },
  { code: "rating_4_0", category: "rating", check: (ctx) => (ctx.displayRating ?? 0) >= 4.0 },
  { code: "rating_4_5", category: "rating", check: (ctx) => (ctx.displayRating ?? 0) >= 4.5 },

  // Community
  { code: "groups_3", category: "community", check: (ctx) => ctx.groupCount >= 3 },
  { code: "groups_5", category: "community", check: (ctx) => ctx.groupCount >= 5 },
  { code: "first_forum_post", category: "community", check: (ctx) => ctx.forumPostCount >= 1 },
  { code: "forum_posts_10", category: "community", check: (ctx) => ctx.forumPostCount >= 10 },

  // Tournament
  { code: "first_tournament", category: "tournament", check: (ctx) => ctx.tournamentCount >= 1 },
  { code: "tournament_win", category: "tournament", check: (ctx) => ctx.tournamentWins >= 1 },
  { code: "tournaments_5", category: "tournament", check: (ctx) => ctx.tournamentCount >= 5 },

  // Ladder
  { code: "step_1", category: "ladder", check: (ctx) => ctx.bestStep === 1 },
];

// ============================================================
// Main function
// ============================================================

/**
 * Check all badge criteria for a player and award any newly earned badges.
 * Optionally filter to only check specific categories (for performance).
 */
export async function checkAndAwardBadges(
  playerId: string,
  categories?: BadgeCategory[]
): Promise<string[]> {
  const supabase = await createServiceClient();

  // 1. Get already-earned badges
  const { data: earnedBadges } = await supabase
    .from("player_badges")
    .select("badge_code")
    .eq("player_id", playerId);

  const earnedSet = new Set((earnedBadges ?? []).map((b) => b.badge_code));

  // 2. Filter to only unearned badges (and optionally by category)
  const toCheck = BADGE_CRITERIA.filter((b) => {
    if (earnedSet.has(b.code)) return false;
    if (categories && !categories.includes(b.category)) return false;
    return true;
  });

  if (toCheck.length === 0) return [];

  // 3. Build player context (only fetch data needed for the categories being checked)
  const ctx = await buildPlayerContext(playerId, supabase, toCheck);

  // 4. Evaluate criteria
  const newlyEarned: string[] = [];
  for (const badge of toCheck) {
    if (badge.check(ctx)) {
      newlyEarned.push(badge.code);
    }
  }

  if (newlyEarned.length === 0) return [];

  // 5. Insert earned badges
  const { error: insertErr } = await supabase.from("player_badges").insert(
    newlyEarned.map((code) => ({
      player_id: playerId,
      badge_code: code,
      earned_at: new Date().toISOString(),
    }))
  );

  if (insertErr) {
    console.error("Failed to insert badges:", insertErr.message);
    return [];
  }

  // 6. Fetch badge names for notifications
  const { data: badgeDefs } = await supabase
    .from("badge_definitions")
    .select("code, name")
    .in("code", newlyEarned);

  const nameMap = new Map((badgeDefs ?? []).map((b) => [b.code, b.name]));

  // 7. Send notifications (non-blocking)
  for (const code of newlyEarned) {
    const badgeName = nameMap.get(code) ?? code;
    notify({
      profileId: playerId,
      type: "badge_earned",
      title: "Badge Unlocked!",
      body: `You earned the "${badgeName}" badge.`,
      link: `/players/${playerId}`,
      emailTemplate: "BadgeEarned",
      emailData: { badgeName, playerUrl: `/players/${playerId}` },
    }).catch((err) => console.error("Badge notification failed:", err));
  }

  return newlyEarned;
}

// ============================================================
// Context builder
// ============================================================

async function buildPlayerContext(
  playerId: string,
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  toCheck: BadgeCriteria[]
): Promise<PlayerContext> {
  const neededCategories = new Set(toCheck.map((b) => b.category));

  const ctx: PlayerContext = {
    playerId,
    totalGames: 0,
    totalWins: 0,
    currentWinStreak: 0,
    displayRating: null,
    groupCount: 0,
    forumPostCount: 0,
    tournamentCount: 0,
    tournamentWins: 0,
    bestStep: null,
  };

  const promises: Promise<void>[] = [];

  // Play + Winning: count games and wins from game_results + free_play_matches
  if (neededCategories.has("play") || neededCategories.has("winning")) {
    promises.push(
      (async () => {
        // Shootout games
        const { data: shootoutGames } = await supabase
          .from("game_results")
          .select("team_a_p1, team_a_p2, team_b_p1, team_b_p2, score_a, score_b, created_at")
          .or(`team_a_p1.eq.${playerId},team_a_p2.eq.${playerId},team_b_p1.eq.${playerId},team_b_p2.eq.${playerId}`)
          .order("created_at", { ascending: false });

        // Free play games
        const { data: freePlayGames } = await supabase
          .from("free_play_matches")
          .select("team_a_p1, team_a_p2, team_b_p1, team_b_p2, score_a, score_b, created_at")
          .or(`team_a_p1.eq.${playerId},team_a_p2.eq.${playerId},team_b_p1.eq.${playerId},team_b_p2.eq.${playerId}`)
          .order("created_at", { ascending: false });

        // Combine and sort by date descending for streak calculation
        type GameRow = { team_a_p1: string; team_a_p2: string | null; team_b_p1: string; team_b_p2: string | null; score_a: number; score_b: number; created_at: string };
        const allGames: GameRow[] = [
          ...(shootoutGames ?? []),
          ...(freePlayGames ?? []),
        ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

        ctx.totalGames = allGames.length;

        let wins = 0;
        let streak = 0;
        let streakBroken = false;

        for (const game of allGames) {
          const onTeamA = game.team_a_p1 === playerId || game.team_a_p2 === playerId;
          const won = onTeamA ? game.score_a > game.score_b : game.score_b > game.score_a;

          if (won) {
            wins++;
            if (!streakBroken) streak++;
          } else {
            streakBroken = true;
          }
        }

        ctx.totalWins = wins;
        ctx.currentWinStreak = streak;
      })()
    );
  }

  // Rating
  if (neededCategories.has("rating")) {
    promises.push(
      (async () => {
        const { data: rating } = await supabase
          .from("player_ratings")
          .select("display_rating")
          .eq("player_id", playerId)
          .single();

        ctx.displayRating = rating?.display_rating ?? null;
      })()
    );
  }

  // Community (groups + forum)
  if (neededCategories.has("community")) {
    promises.push(
      (async () => {
        const { count: groupCount } = await supabase
          .from("group_memberships")
          .select("*", { count: "exact", head: true })
          .eq("player_id", playerId);

        ctx.groupCount = groupCount ?? 0;
      })()
    );

    promises.push(
      (async () => {
        const { count: forumCount } = await supabase
          .from("forum_threads")
          .select("*", { count: "exact", head: true })
          .eq("author_id", playerId);

        ctx.forumPostCount = forumCount ?? 0;
      })()
    );
  }

  // Tournament
  if (neededCategories.has("tournament")) {
    promises.push(
      (async () => {
        const { count: tournamentCount } = await supabase
          .from("tournament_registrations")
          .select("*", { count: "exact", head: true })
          .eq("player_id", playerId)
          .neq("status", "withdrawn");

        ctx.tournamentCount = tournamentCount ?? 0;
      })()
    );

    promises.push(
      (async () => {
        // Count tournament wins: matches where this player is the winner in a final round
        const { data: wonMatches } = await supabase
          .from("tournament_matches")
          .select("tournament_id")
          .eq("winner_id", playerId)
          .eq("status", "completed");

        // A tournament win is when the player won the last match (highest round) in a bracket
        // Simplified: count distinct tournaments where they have at least one win
        // More accurate: check if they won the final match — but for now, we check
        // tournament_matches where they are winner_id AND there's no next match
        // For simplicity, count tournaments where player is winner in final match (round = max round)
        ctx.tournamentWins = 0;
        if (wonMatches && wonMatches.length > 0) {
          // Get unique tournament IDs
          const tournamentIds = [...new Set(wonMatches.map((m) => m.tournament_id))];
          for (const tid of tournamentIds) {
            const { data: maxRoundMatch } = await supabase
              .from("tournament_matches")
              .select("winner_id")
              .eq("tournament_id", tid)
              .eq("status", "completed")
              .order("round", { ascending: false })
              .limit(1)
              .single();

            if (maxRoundMatch?.winner_id === playerId) {
              ctx.tournamentWins++;
            }
          }
        }
      })()
    );
  }

  // Ladder
  if (neededCategories.has("ladder")) {
    promises.push(
      (async () => {
        const { data: memberships } = await supabase
          .from("group_memberships")
          .select("current_step")
          .eq("player_id", playerId);

        if (memberships && memberships.length > 0) {
          ctx.bestStep = Math.min(...memberships.map((m) => m.current_step));
        }
      })()
    );
  }

  await Promise.all(promises);
  return ctx;
}
