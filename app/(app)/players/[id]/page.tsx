import { EmptyState } from "@/components/empty-state";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import type { Profile, GroupMembership, GameResult, Registration } from "@/types/database";
import Link from "next/link";
import { notFound } from "next/navigation";

interface PlayerPageProps {
  params: Promise<{ id: string }>;
}

export default async function PlayerProfilePage({ params }: PlayerPageProps) {
  const { id } = await params;
  const supabase = await createClient();

  // Fetch profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", id)
    .single<Profile>();

  if (!profile) notFound();

  // Fetch group memberships with group details
  const { data: memberships } = await supabase
    .from("group_memberships")
    .select("*, group:shootout_groups(*)")
    .eq("player_id", id)
    .returns<(GroupMembership & { group: NonNullable<GroupMembership["group"]> })[]>();

  // Fetch recent game results (last 10) where player participated
  const { data: recentGames } = await supabase
    .from("game_results")
    .select("*")
    .or(`team_a_p1.eq.${id},team_a_p2.eq.${id},team_b_p1.eq.${id},team_b_p2.eq.${id}`)
    .order("created_at", { ascending: false })
    .limit(10)
    .returns<GameResult[]>();

  // Fetch recent registrations (last 10) with signup sheet details
  const { data: recentRegistrations } = await supabase
    .from("registrations")
    .select("*, sheet:signup_sheets(*, group:shootout_groups(name, slug))")
    .eq("player_id", id)
    .order("signed_up_at", { ascending: false })
    .limit(10)
    .returns<(Registration & { sheet: { id: string; event_date: string; location: string; group: { name: string; slug: string } | null } })[]>();

  // Current user for edit check
  const { data: { user } } = await supabase.auth.getUser();
  const { data: currentProfile } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("user_id", user!.id)
    .single<Pick<Profile, "id" | "role">>();

  const isOwnProfile = currentProfile?.id === id;
  const isAdmin = currentProfile?.role === "admin";

  // Compute stats
  const totalSessions = memberships?.reduce((sum, m) => sum + m.total_sessions, 0) ?? 0;

  // Merge recent activity into a single feed sorted by date
  type ActivityItem =
    | { type: "game"; date: string; game: GameResult }
    | { type: "registration"; date: string; registration: NonNullable<typeof recentRegistrations>[number] };

  const activity: ActivityItem[] = [];

  if (recentGames) {
    for (const game of recentGames) {
      activity.push({ type: "game", date: game.created_at, game });
    }
  }

  if (recentRegistrations) {
    for (const reg of recentRegistrations) {
      activity.push({ type: "registration", date: reg.signed_up_at, registration: reg });
    }
  }

  activity.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const recentActivity = activity.slice(0, 10);

  return (
    <div className="space-y-8">
      {/* Profile Header */}
      <div className="card">
        <div className="flex flex-col sm:flex-row items-start gap-6">
          {/* Avatar */}
          {profile.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt={profile.display_name}
              className="h-24 w-24 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-brand-900/50 text-brand-300 text-3xl font-bold">
              {profile.display_name?.charAt(0).toUpperCase()}
            </div>
          )}

          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-dark-100">
                {profile.display_name}
              </h1>
              {profile.is_active ? (
                <span className="badge-green">Active</span>
              ) : (
                <span className="badge-red">Inactive</span>
              )}
            </div>

            {profile.bio && (
              <p className="mt-2 text-surface-muted">{profile.bio}</p>
            )}

            <div className="mt-3 flex flex-wrap gap-4 text-sm text-surface-muted">
              {profile.home_court && (
                <span>Home Court: {profile.home_court}</span>
              )}
              <span>
                Member since {formatDate(profile.member_since)}
              </span>
              {profile.skill_level && (
                <span>Skill Level: {profile.skill_level}</span>
              )}
            </div>
          </div>

          {(isOwnProfile || isAdmin) && (
            <Link
              href={`/players/${id}/edit`}
              className="btn-secondary text-sm"
            >
              Edit Profile
            </Link>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="card">
          <p className="text-sm text-surface-muted">Total Sessions</p>
          <p className="mt-1 text-2xl font-bold text-dark-100">
            {totalSessions}
          </p>
        </div>
      </div>

      {/* DUPR & USA Pickleball */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="card">
          <h3 className="text-sm font-semibold text-dark-100 mb-3">DUPR</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-surface-muted">ID</span>
              <span className="font-medium text-dark-100">{profile.dupr_id || "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-surface-muted">Singles</span>
              {profile.dupr_singles_rating ? (
                <span className="inline-flex items-center rounded-md bg-brand-900/40 px-2 py-0.5 text-xs font-semibold text-brand-300">
                  {profile.dupr_singles_rating}
                </span>
              ) : (
                <span className="font-medium text-dark-100">—</span>
              )}
            </div>
            <div className="flex justify-between">
              <span className="text-surface-muted">Doubles</span>
              {profile.dupr_doubles_rating ? (
                <span className="inline-flex items-center rounded-md bg-brand-900/40 px-2 py-0.5 text-xs font-semibold text-brand-300">
                  {profile.dupr_doubles_rating}
                </span>
              ) : (
                <span className="font-medium text-dark-100">—</span>
              )}
            </div>
          </div>
        </div>
        <div className="card">
          <h3 className="text-sm font-semibold text-dark-100 mb-3">USA Pickleball</h3>
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
                ) : (
                  <span className="font-medium text-dark-100">—</span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Group Memberships */}
      <section>
        <h2 className="mb-4 text-lg font-semibold text-dark-100">
          Group Memberships
        </h2>
        {memberships && memberships.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {memberships.map((m) => (
              <Link
                key={m.group_id}
                href={`/groups/${m.group.slug}`}
                className="card hover:ring-brand-500/30 transition-shadow"
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-dark-100">
                    {m.group.name}
                  </h3>
                  <span className={m.group.group_type === "free_play" ? "badge-yellow" : "badge-blue"}>
                    {m.group.group_type === "free_play" ? "Free Play" : "Ladder"}
                  </span>
                </div>
                <div className="mt-2 space-y-1 text-sm text-surface-muted">
                  {m.group.group_type !== "free_play" && (
                    <>
                      <div className="flex justify-between">
                        <span>Step</span>
                        <span className="font-medium text-dark-100">
                          {m.current_step}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Win %</span>
                        <span className="font-medium text-dark-100">
                          {m.win_pct}%
                        </span>
                      </div>
                    </>
                  )}
                  <div className="flex justify-between">
                    <span>Sessions</span>
                    <span className="font-medium text-dark-100">
                      {m.total_sessions}
                    </span>
                  </div>
                </div>
                {m.last_played_at && (
                  <p className="mt-2 text-xs text-surface-muted">
                    Last played {formatDate(m.last_played_at)}
                  </p>
                )}
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No group memberships yet"
            description="Join a group to start playing."
            actionLabel="Browse groups"
            actionHref="/groups"
          />
        )}
      </section>

      {/* Recent Activity */}
      <section>
        <h2 className="mb-4 text-lg font-semibold text-dark-100">
          Recent Activity
        </h2>
        {recentActivity.length > 0 ? (
          <div className="space-y-3">
            {recentActivity.map((item, idx) => {
              if (item.type === "game") {
                const game = item.game;
                const onTeamA =
                  game.team_a_p1 === id || game.team_a_p2 === id;
                const won = onTeamA
                  ? game.score_a > game.score_b
                  : game.score_b > game.score_a;

                return (
                  <div key={`game-${game.id}`} className="card flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span
                          className={
                            won ? "badge-green" : "badge-red"
                          }
                        >
                          {won ? "Win" : "Loss"}
                        </span>
                        <span className="text-sm font-medium text-dark-100">
                          Round {game.round_number}, Pool {game.pool_number}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-surface-muted">
                        Score: {game.score_a} - {game.score_b}
                      </p>
                    </div>
                    <span className="text-xs text-surface-muted">
                      {formatDate(game.created_at)}
                    </span>
                  </div>
                );
              }

              const reg = item.registration;
              return (
                <div key={`reg-${reg.id}`} className="card flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="badge-blue">Signup</span>
                      <span className="text-sm font-medium text-dark-100">
                        {reg.sheet?.group?.name ?? "Event"}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-surface-muted">
                      {reg.sheet?.event_date
                        ? formatDate(reg.sheet.event_date)
                        : ""}{" "}
                      at {reg.sheet?.location ?? "TBD"}
                    </p>
                  </div>
                  <span
                    className={
                      reg.status === "confirmed"
                        ? "badge-green"
                        : reg.status === "waitlist"
                          ? "badge-yellow"
                          : "badge-gray"
                    }
                  >
                    {reg.status}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState
            title="No recent activity"
            description="Games and event sign-ups will appear here."
          />
        )}
      </section>

      {/* Head-to-Head Placeholder */}
      <section>
        <h2 className="mb-4 text-lg font-semibold text-dark-100">
          Head-to-Head
        </h2>
        <EmptyState
          title="Coming Soon"
          description="Head-to-head stats against other players will appear here."
        />
      </section>
    </div>
  );
}
