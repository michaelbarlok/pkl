import { EmptyState } from "@/components/empty-state";
import { createClient } from "@/lib/supabase/server";
import { getAllBadgeDefinitions, getPlayerBadges, getBadgeLeaderboard } from "@/lib/queries/badges";
import type { BadgeCategory, BadgeDefinition } from "@/types/database";
import type { PlayerBadgeWithDefinition } from "@/lib/queries/badges";
import Link from "next/link";
import { SyncBadgesButton } from "./sync-button";

const CATEGORY_LABELS: Record<BadgeCategory, string> = {
  play: "Play Milestones",
  winning: "Winning",
  rating: "Rating",
  community: "Community",
  tournament: "Tournament",
  ladder: "Ladder",
};

const CATEGORY_COLORS: Record<BadgeCategory, string> = {
  play: "bg-blue-900/40 text-blue-300 border-blue-500/30",
  winning: "bg-teal-900/40 text-teal-300 border-teal-500/30",
  rating: "bg-accent-900/40 text-accent-300 border-accent-500/30",
  community: "bg-violet-900/40 text-violet-300 border-violet-500/30",
  tournament: "bg-amber-900/40 text-amber-300 border-amber-500/30",
  ladder: "bg-rose-900/40 text-rose-300 border-rose-500/30",
};

const CATEGORY_ICON_BG: Record<BadgeCategory, string> = {
  play: "bg-blue-500/20",
  winning: "bg-teal-500/20",
  rating: "bg-accent-500/20",
  community: "bg-violet-500/20",
  tournament: "bg-amber-500/20",
  ladder: "bg-rose-500/20",
};

export default async function BadgesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile } = user
    ? await supabase.from("profiles").select("id").eq("user_id", user.id).single()
    : { data: null };

  const [allBadges, playerBadges, leaderboard] = await Promise.all([
    getAllBadgeDefinitions(),
    profile ? getPlayerBadges(profile.id) : Promise.resolve([]),
    getBadgeLeaderboard(10),
  ]);

  const earnedSet = new Set(playerBadges.map((b) => b.badge_code));
  const earnedMap = new Map(playerBadges.map((b) => [b.badge_code, b]));

  // Group badges by category
  const grouped = new Map<BadgeCategory, BadgeDefinition[]>();
  for (const badge of allBadges) {
    const cat = badge.category as BadgeCategory;
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat)!.push(badge);
  }

  const earnedCount = playerBadges.length;
  const totalCount = allBadges.length;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-dark-100">Badges</h1>
        <p className="mt-1 text-surface-muted">
          Earn badges by playing games, winning matches, and participating in the community.
        </p>
      </div>

      {/* Progress summary */}
      {profile && (
        <div className="card">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <p className="text-sm text-surface-muted">Your Progress</p>
              <p className="mt-1 text-2xl font-bold text-dark-100">
                {earnedCount} / {totalCount}
              </p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <div className="w-48">
                <div className="h-3 rounded-full bg-surface-overlay overflow-hidden">
                  <div
                    className="h-full rounded-full bg-brand-500 transition-all"
                    style={{ width: `${totalCount > 0 ? (earnedCount / totalCount) * 100 : 0}%` }}
                  />
                </div>
                <p className="mt-1 text-xs text-surface-muted text-right">
                  {totalCount > 0 ? Math.round((earnedCount / totalCount) * 100) : 0}% complete
                </p>
              </div>
              <SyncBadgesButton />
            </div>
          </div>
        </div>
      )}

      {/* Badge categories */}
      {[...grouped.entries()].map(([category, badges]) => (
        <section key={category}>
          <h2 className="mb-4 text-lg font-semibold text-dark-100">
            {CATEGORY_LABELS[category]}
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {badges.map((badge) => {
              const earned = earnedSet.has(badge.code);
              const earnedBadge = earnedMap.get(badge.code);

              return (
                <div
                  key={badge.code}
                  className={`card flex items-center gap-4 border transition-all ${
                    earned
                      ? CATEGORY_COLORS[category]
                      : "opacity-50 border-surface-border"
                  }`}
                >
                  <div
                    className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-xl ${
                      earned
                        ? CATEGORY_ICON_BG[category]
                        : "bg-surface-overlay"
                    }`}
                  >
                    {earned ? (
                      <BadgeIcon category={category} />
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-6 w-6 text-dark-400">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
                      </svg>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`font-semibold ${earned ? "" : "text-dark-300"}`}>
                      {badge.name}
                    </p>
                    <p className={`text-sm ${earned ? "opacity-80" : "text-dark-400"}`}>
                      {badge.description}
                    </p>
                    {earned && earnedBadge && (
                      <p className="text-xs opacity-60 mt-0.5">
                        Earned {new Date(earnedBadge.earned_at).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}

      {/* Leaderboard */}
      {leaderboard.length > 0 && (
        <section>
          <h2 className="mb-4 text-lg font-semibold text-dark-100">
            Most Badges Earned
          </h2>
          <div className="card">
            <div className="space-y-3">
              {leaderboard.map((entry, idx) => (
                <Link
                  key={entry.player_id}
                  href={`/players/${entry.player_id}`}
                  className="flex items-center gap-3 rounded-lg p-2 hover:bg-surface-overlay transition-colors"
                >
                  <span className="w-6 text-center text-sm font-bold text-surface-muted">
                    {idx + 1}
                  </span>
                  {entry.avatar_url ? (
                    <img
                      src={entry.avatar_url}
                      alt={entry.display_name}
                      className="h-8 w-8 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-900/50 text-brand-300 text-sm font-medium">
                      {entry.display_name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <span className="flex-1 text-sm font-medium text-dark-100">
                    {entry.display_name}
                  </span>
                  <span className="text-sm font-semibold text-brand-300">
                    {entry.badge_count} {entry.badge_count === 1 ? "badge" : "badges"}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function BadgeIcon({ category }: { category: BadgeCategory }) {
  switch (category) {
    case "play":
      return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6">
          <path fillRule="evenodd" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" clipRule="evenodd" />
        </svg>
      );
    case "winning":
      return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6">
          <path fillRule="evenodd" d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.006 5.404.434c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.434 2.082-5.005Z" clipRule="evenodd" />
        </svg>
      );
    case "rating":
      return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6">
          <path fillRule="evenodd" d="M2.25 13.5a8.25 8.25 0 0 1 8.25-8.25.75.75 0 0 1 .75.75v6.75H18a.75.75 0 0 1 .75.75 8.25 8.25 0 0 1-16.5 0Z" clipRule="evenodd" />
          <path fillRule="evenodd" d="M12.75 3a.75.75 0 0 1 .75-.75 8.25 8.25 0 0 1 8.25 8.25.75.75 0 0 1-.75.75h-7.5a.75.75 0 0 1-.75-.75V3Z" clipRule="evenodd" />
        </svg>
      );
    case "community":
      return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6">
          <path d="M4.913 2.658c2.075-.27 4.19-.408 6.337-.408 2.147 0 4.262.139 6.337.408 1.922.25 3.291 1.861 3.405 3.727a4.403 4.403 0 0 0-1.032-.211 50.89 50.89 0 0 0-8.42 0c-2.358.196-4.04 2.19-4.04 4.434v4.286a4.47 4.47 0 0 0 2.433 3.984L7.28 21.53A.75.75 0 0 1 6 21v-4.03a48.527 48.527 0 0 1-1.087-.128C2.905 16.58 1.5 14.833 1.5 12.862V6.638c0-1.97 1.405-3.718 3.413-3.979Z" />
          <path d="M15.75 7.5c-1.376 0-2.739.057-4.086.169C10.124 7.797 9 9.103 9 10.609v4.285c0 1.507 1.128 2.814 2.67 2.94 1.243.102 2.5.157 3.768.165l2.782 2.781a.75.75 0 0 0 1.28-.53v-2.39l.33-.026c1.542-.125 2.67-1.433 2.67-2.94v-4.286c0-1.505-1.125-2.811-2.664-2.94A49.392 49.392 0 0 0 15.75 7.5Z" />
        </svg>
      );
    case "tournament":
      return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6">
          <path fillRule="evenodd" d="M5.166 2.621v.858c-1.035.148-2.059.33-3.071.543a.75.75 0 0 0-.584.859 6.753 6.753 0 0 0 6.138 5.6 6.73 6.73 0 0 0 2.743 1.346A6.707 6.707 0 0 1 9.279 15H8.54c-1.036 0-1.875.84-1.875 1.875V19.5h-.75a.75.75 0 0 0 0 1.5h12.17a.75.75 0 0 0 0-1.5h-.75v-2.625c0-1.036-.84-1.875-1.875-1.875h-.739a6.707 6.707 0 0 1-1.112-3.173 6.73 6.73 0 0 0 2.743-1.347 6.753 6.753 0 0 0 6.139-5.6.75.75 0 0 0-.585-.858 47.077 47.077 0 0 0-3.07-.543V2.62a.75.75 0 0 0-.658-.744 49.22 49.22 0 0 0-6.093-.377c-2.063 0-4.096.128-6.093.377a.75.75 0 0 0-.657.744Zm0 2.629c0 1.196.312 2.32.857 3.294A5.266 5.266 0 0 1 3.16 5.337a45.6 45.6 0 0 1 2.006-.343v.256Zm13.5 0v-.256c.674.1 1.343.214 2.006.343a5.265 5.265 0 0 1-2.863 3.207 6.72 6.72 0 0 0 .857-3.294Z" clipRule="evenodd" />
        </svg>
      );
    case "ladder":
      return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6">
          <path fillRule="evenodd" d="M15.22 6.268a.75.75 0 0 1 .968-.431l5.942 2.28a.75.75 0 0 1 .431.97l-2.28 5.941a.75.75 0 1 1-1.4-.537l1.63-4.251-1.086.484a11.2 11.2 0 0 0-5.45 5.173.75.75 0 0 1-1.199.19L9 12.312l-6.22 6.22a.75.75 0 0 1-1.06-1.061l6.75-6.75a.75.75 0 0 1 1.06 0l3.606 3.606a12.695 12.695 0 0 1 5.68-4.974l1.086-.483-4.251-1.632a.75.75 0 0 1-.43-.968Z" clipRule="evenodd" />
        </svg>
      );
  }
}
