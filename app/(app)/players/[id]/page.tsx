import { EmptyState } from "@/components/empty-state";
import { createClient } from "@/lib/supabase/server";
import { displaySessionsForGroup, formatDate } from "@/lib/utils";
import { getPlayerBadges, getBadgeStats } from "@/lib/queries/badges";
import type { Profile, GroupMembership, GameResult, Registration, BadgeCategory } from "@/types/database";
import Link from "next/link";
import { notFound } from "next/navigation";

const BADGE_CATEGORY_STYLES: Record<BadgeCategory, string> = {
  play: "bg-blue-900/40 text-blue-300 border-blue-500/30",
  winning: "bg-teal-900/40 text-teal-300 border-teal-500/30",
  rating: "bg-accent-900/40 text-accent-300 border-accent-500/30",
  community: "bg-violet-900/40 text-violet-300 border-violet-500/30",
  tournament: "bg-amber-900/40 text-amber-300 border-amber-500/30",
  ladder: "bg-rose-900/40 text-rose-300 border-rose-500/30",
};

interface PlayerPageProps {
  params: Promise<{ id: string }>;
}

export default async function PlayerProfilePage({ params }: PlayerPageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", id)
    .single<Profile>();
  if (!profile) notFound();

  const [
    { data: memberships },
    { data: recentGames },
    { data: recentRegistrations },
    { data: { user } },
    playerBadges,
    badgeStats,
    { data: sessionParticipations },
  ] = await Promise.all([
    supabase.from("group_memberships").select("*, group:shootout_groups(*, group_preferences(pct_window_sessions))").eq("player_id", id).returns<(GroupMembership & { group: NonNullable<GroupMembership["group"]> })[]>(),
    supabase.from("game_results").select("*").or(`team_a_p1.eq.${id},team_a_p2.eq.${id},team_b_p1.eq.${id},team_b_p2.eq.${id}`).order("created_at", { ascending: false }).limit(10).returns<GameResult[]>(),
    supabase.from("registrations").select("*, sheet:signup_sheets(*, group:shootout_groups(name, slug))").eq("player_id", id).order("signed_up_at", { ascending: false }).limit(10).returns<(Registration & { sheet: { id: string; event_date: string; location: string; group: { name: string; slug: string } | null } })[]>(),
    supabase.auth.getUser(),
    getPlayerBadges(id),
    getBadgeStats(id),
    supabase.from("session_participants").select("checked_in, shootout_sessions!inner(created_at)").eq("player_id", id).order("created_at", { ascending: false, referencedTable: "shootout_sessions" }).limit(50),
  ]);

  const { data: currentProfile } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("user_id", user!.id)
    .single<Pick<Profile, "id" | "role">>();

  const isOwnProfile = currentProfile?.id === id;
  const isAdmin = currentProfile?.role === "admin";

  // Compute aggregate stats. Each membership contributes the
  // display-capped session count (lifetime total clamped to the
  // group's pct_window_sessions) so the profile strip matches what
  // that same player sees on each group's rankings page.
  const displayedSessionsByMembership = (memberships ?? []).map((m) =>
    displaySessionsForGroup(
      m.total_sessions,
      (m.group as any)?.group_preferences?.pct_window_sessions
    )
  );
  const totalSessions = displayedSessionsByMembership.reduce((s, n) => s + n, 0);
  const weightedWinPct = totalSessions > 0
    ? Math.round(
        (memberships ?? []).reduce(
          (s, m, i) => s + (m.win_pct ?? 0) * displayedSessionsByMembership[i],
          0
        ) / totalSessions
      )
    : null;

  // Attendance streak (consecutive checked-in sessions, most recent first)
  let streak = 0;
  for (const p of sessionParticipations ?? []) {
    if ((p as any).checked_in) streak++;
    else break;
  }

  // Recent game W/L
  const recentWins = (recentGames ?? []).filter((g) => {
    const onA = g.team_a_p1 === id || g.team_a_p2 === id;
    return onA ? g.score_a > g.score_b : g.score_b > g.score_a;
  }).length;
  const recentLosses = (recentGames ?? []).length - recentWins;

  // Unified activity feed
  type ActivityItem =
    | { type: "game"; date: string; game: GameResult }
    | { type: "registration"; date: string; registration: NonNullable<typeof recentRegistrations>[number] };

  const activity: ActivityItem[] = [
    ...(recentGames ?? []).map((game) => ({ type: "game" as const, date: game.created_at, game })),
    ...(recentRegistrations ?? []).map((reg) => ({ type: "registration" as const, date: reg.signed_up_at, registration: reg })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 10);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ── Hero Card ── */}
      <div className="card overflow-hidden p-0">
        {/* Gradient accent band */}
        <div className="h-2 bg-gradient-to-r from-brand-700 via-brand-500 to-teal-500" />

        <div className="p-5">
          <div className="flex flex-col sm:flex-row items-start gap-5">
            {/* Avatar */}
            <div className="shrink-0">
              {profile.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt={profile.display_name}
                  className="h-20 w-20 rounded-full object-cover ring-4 ring-brand-500/20"
                />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-brand-900/50 text-brand-300 text-3xl font-bold ring-4 ring-brand-500/20">
                  {profile.display_name?.charAt(0).toUpperCase()}
                </div>
              )}
            </div>

            {/* Name + meta */}
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold text-dark-100">{profile.display_name}</h1>
                {profile.is_active ? (
                  <span className="badge-green">Active</span>
                ) : (
                  <span className="badge-red">Inactive</span>
                )}
              </div>

              {profile.bio && (
                <p className="mt-1.5 text-sm text-surface-muted leading-relaxed">{profile.bio}</p>
              )}

              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-surface-muted">
                {profile.home_court && <span>Home Court: {profile.home_court}</span>}
                <span>Member since {formatDate(profile.member_since)}</span>
                {profile.skill_level && <span>Skill Level: {profile.skill_level}</span>}
              </div>
            </div>

            {(isOwnProfile || isAdmin) && (
              <Link href={`/players/${id}/edit`} className="btn-secondary text-sm shrink-0">
                Edit Profile
              </Link>
            )}
          </div>

          {/* Stat strip */}
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-5 border-t border-surface-border pt-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-dark-100">{totalSessions}</p>
              <p className="text-[11px] uppercase tracking-wide text-surface-muted">Sessions</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-dark-100">
                {weightedWinPct !== null ? `${weightedWinPct}%` : "—"}
              </p>
              <p className="text-[11px] uppercase tracking-wide text-surface-muted">Pt Win %</p>
            </div>
            <div className="text-center">
              {profile.dupr_doubles_rating ? (
                <>
                  <p className="text-2xl font-bold text-brand-300">{profile.dupr_doubles_rating}</p>
                  <p className="text-[11px] uppercase tracking-wide text-surface-muted">DUPR Dbl</p>
                </>
              ) : (
                <>
                  <p className="text-2xl font-bold text-dark-400">—</p>
                  <p className="text-[11px] uppercase tracking-wide text-surface-muted">DUPR</p>
                </>
              )}
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-dark-100">{badgeStats.earned}</p>
              <p className="text-[11px] uppercase tracking-wide text-surface-muted">Badges</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-dark-100">
                {streak > 0 ? `🔥 ${streak}` : "—"}
              </p>
              <p className="text-[11px] uppercase tracking-wide text-surface-muted">Streak</p>
            </div>
          </div>
        </div>
      </div>

      {/* Recent game record */}
      {(recentGames ?? []).length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="card text-center">
            <p className="text-2xl font-bold text-teal-300">{recentWins}</p>
            <p className="text-xs text-surface-muted">Recent W</p>
          </div>
          <div className="card text-center">
            <p className="text-2xl font-bold text-red-400">{recentLosses}</p>
            <p className="text-xs text-surface-muted">Recent L</p>
          </div>
          <div className="card text-center">
            <p className="text-2xl font-bold text-dark-100">
              {(recentGames ?? []).length > 0 ? `${Math.round((recentWins / (recentGames ?? []).length) * 100)}%` : "—"}
            </p>
            <p className="text-xs text-surface-muted">Win Rate</p>
          </div>
        </div>
      )}

      {/* Badges */}
      {playerBadges.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-surface-muted">
              Badges <span className="text-dark-300 normal-case tracking-normal">· {badgeStats.earned}/{badgeStats.total}</span>
            </h2>
            <Link href="/badges" className="text-sm text-brand-400 hover:text-brand-300">View all</Link>
          </div>
          <div className="flex flex-wrap gap-2">
            {playerBadges.map((pb) => {
              const category = pb.badge?.category as BadgeCategory | undefined;
              return (
                <div
                  key={pb.badge_code}
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${BADGE_CATEGORY_STYLES[category ?? "play"]}`}
                  title={`${pb.badge?.description ?? ""} — Earned ${new Date(pb.earned_at).toLocaleDateString()}`}
                >
                  {pb.badge?.name ?? pb.badge_code}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Ratings */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="card">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-muted mb-3">DUPR</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-surface-muted">ID</span>
              <span className="font-medium text-dark-100">{profile.dupr_id || "—"}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-surface-muted">Singles</span>
              {profile.dupr_singles_rating ? (
                <span className="rounded-md bg-brand-900/40 px-2 py-0.5 text-xs font-semibold text-brand-300">
                  {profile.dupr_singles_rating}
                </span>
              ) : <span className="text-dark-300">—</span>}
            </div>
            <div className="flex justify-between items-center">
              <span className="text-surface-muted">Doubles</span>
              {profile.dupr_doubles_rating ? (
                <span className="rounded-md bg-brand-900/40 px-2 py-0.5 text-xs font-semibold text-brand-300">
                  {profile.dupr_doubles_rating}
                </span>
              ) : <span className="text-dark-300">—</span>}
            </div>
          </div>
        </div>
        <div className="card">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-muted mb-3">USA Pickleball</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-surface-muted">Member ID</span>
              <span className="font-medium text-dark-100">{profile.usap_member_id || "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-surface-muted">Tier</span>
              <span className="font-medium text-dark-100">{profile.usap_tier || "—"}</span>
            </div>
            {(isOwnProfile || isAdmin) && (
              <div className="flex justify-between">
                <span className="text-surface-muted">Expires</span>
                {profile.usap_expiration ? (
                  <span className={`font-medium ${new Date(profile.usap_expiration) >= new Date() ? "text-teal-300" : "text-red-400"}`}>
                    {formatDate(profile.usap_expiration)}
                    {new Date(profile.usap_expiration) < new Date() && " (Expired)"}
                  </span>
                ) : <span className="text-dark-300">—</span>}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Group Memberships */}
      {memberships && memberships.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-surface-muted mb-3">Groups</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {memberships.map((m) => (
              <Link
                key={m.group_id}
                href={`/groups/${m.group.slug}`}
                className="card hover:ring-brand-500/30 transition-shadow"
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-dark-100 truncate">{m.group.name}</h3>
                  <span className={m.group.group_type === "free_play" ? "badge-yellow" : "badge-blue"}>
                    {m.group.group_type === "free_play" ? "Free Play" : "Ladder"}
                  </span>
                </div>
                {(() => {
                  const shownSessions = displaySessionsForGroup(
                    m.total_sessions,
                    (m.group as any)?.group_preferences?.pct_window_sessions
                  );
                  return m.group.group_type !== "free_play" ? (
                    <div className="grid grid-cols-3 gap-1 text-center mt-3">
                      <div>
                        <p className="text-base font-bold text-dark-100">{m.current_step}</p>
                        <p className="text-[10px] text-surface-muted uppercase tracking-wide">Step</p>
                      </div>
                      <div>
                        <p className="text-base font-bold text-dark-100">{m.win_pct}%</p>
                        <p className="text-[10px] text-surface-muted uppercase tracking-wide">Pts</p>
                      </div>
                      <div>
                        <p className="text-base font-bold text-dark-100">{shownSessions}</p>
                        <p className="text-[10px] text-surface-muted uppercase tracking-wide">Sessions</p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-surface-muted">{shownSessions} sessions</p>
                  );
                })()}
                {m.last_played_at && (
                  <p className="mt-2 text-xs text-surface-muted">Last played {formatDate(m.last_played_at)}</p>
                )}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Recent Activity */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-surface-muted mb-3">Recent Activity</h2>
        {activity.length > 0 ? (
          <div className="space-y-2">
            {activity.map((item) => {
              if (item.type === "game") {
                const game = item.game;
                const onTeamA = game.team_a_p1 === id || game.team_a_p2 === id;
                const won = onTeamA ? game.score_a > game.score_b : game.score_b > game.score_a;
                return (
                  <div key={`game-${game.id}`} className={`card flex items-center justify-between ${won ? "border-l-2 border-l-teal-500/60" : "border-l-2 border-l-red-500/40"}`}>
                    <div className="flex items-center gap-3">
                      <span className={won ? "badge-green" : "badge-red"}>{won ? "W" : "L"}</span>
                      <div>
                        <p className="text-sm font-medium text-dark-100">
                          Round {game.round_number}, Pool {game.pool_number}
                        </p>
                        <p className="text-xs text-surface-muted">
                          {game.score_a} – {game.score_b}
                        </p>
                      </div>
                    </div>
                    <span className="text-xs text-surface-muted">{formatDate(game.created_at)}</span>
                  </div>
                );
              }
              const reg = item.registration;
              return (
                <div key={`reg-${reg.id}`} className="card flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="badge-blue">Signup</span>
                    <div>
                      <p className="text-sm font-medium text-dark-100">{reg.sheet?.group?.name ?? "Event"}</p>
                      <p className="text-xs text-surface-muted">
                        {reg.sheet?.event_date ? formatDate(reg.sheet.event_date) : ""} · {reg.sheet?.location}
                      </p>
                    </div>
                  </div>
                  <span className={reg.status === "confirmed" ? "badge-green" : reg.status === "waitlist" ? "badge-yellow" : "badge-gray"}>
                    {reg.status}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState title="No recent activity" description="Games and event sign-ups will appear here." />
        )}
      </section>
    </div>
  );
}
