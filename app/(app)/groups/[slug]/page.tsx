import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getGroupMembers, getGroupSheets, isGroupMember } from "@/lib/queries/group";
import { getRecentMatches, getPlayerStats } from "@/lib/queries/free-play";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cn } from "@/lib/utils";
import { formatDate, formatTime } from "@/lib/utils";
import { FreePlayLeaderboard } from "./leaderboard";
import { InviteButton } from "./invite-button";
import { ResetStatsButton } from "./reset-stats-button";
import { RollingSessionsSetting } from "./rolling-sessions-setting";
import type { GroupWithPreferences } from "@/lib/queries/group";

export default async function GroupPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { slug } = await params;
  const { token } = await searchParams;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Get the user's profile (null if not logged in)
  const profile = user
    ? (await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user.id)
        .single()
      ).data
    : null;

  // Try fetching the group normally (respects RLS — works for public groups
  // or private groups the user is already a member of)
  let group: GroupWithPreferences | null = null;
  {
    const { data } = await supabase
      .from("shootout_groups")
      .select("*, group_preferences(*)")
      .eq("slug", slug)
      .eq("is_active", true)
      .single();
    group = data as GroupWithPreferences | null;
  }

  // For private groups, fall back to token-based access (bypasses RLS)
  let tokenValid = false;
  if (!group && token) {
    const serviceClient = await createServiceClient();

    // Validate the token and get the group_id it belongs to
    const { data: invite } = await serviceClient
      .from("group_invites")
      .select("group_id")
      .eq("token", token)
      .maybeSingle();

    if (invite) {
      const { data: g } = await serviceClient
        .from("shootout_groups")
        .select("*, group_preferences(*)")
        .eq("id", invite.group_id)
        .eq("slug", slug)
        .eq("is_active", true)
        .single();

      if (g) {
        group = g as GroupWithPreferences;
        tokenValid = true;
      }
    }
  }

  if (!group) notFound();

  const isMember = profile ? await isGroupMember(group.id, profile.id) : false;

  // Check if user is a group admin
  let isGroupAdmin = false;
  if (isMember && profile) {
    const { data: membership } = await supabase
      .from("group_memberships")
      .select("group_role")
      .eq("group_id", group.id)
      .eq("player_id", profile.id)
      .maybeSingle();
    isGroupAdmin = membership?.group_role === "admin";
  }

  const members = await getGroupMembers(group.id);
  const sheets = await getGroupSheets(group.id);
  const isFreePlay = group.group_type === "free_play";

  const recentMatches = isFreePlay ? await getRecentMatches(group.id, 10) : [];
  const playerStats = isFreePlay ? await getPlayerStats(group.id) : [];

  // Check for active free play session
  let activeSessionId: string | null = null;
  if (isFreePlay && isMember) {
    const { data: activeSession } = await supabase
      .from("free_play_sessions")
      .select("id")
      .eq("group_id", group.id)
      .eq("status", "active")
      .maybeSingle();
    activeSessionId = activeSession?.id ?? null;
  }

  // Build the "next" URL to use when redirecting unauthenticated users to login
  const nextUrl = token
    ? `/groups/${slug}?token=${token}`
    : `/groups/${slug}`;

  // Whether a non-member should see the "Join Group" button
  const canJoin =
    group.visibility === "public" ||
    tokenValid ||
    (group.visibility === "private" && isMember);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Link
              href="/groups"
              className="text-sm text-surface-muted hover:text-dark-200"
            >
              Groups
            </Link>
            <span className="text-sm text-surface-muted">/</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold text-dark-100">
            {group.name}
          </h1>
          {(group.city || group.state) && (
            <p className="mt-1 text-xs text-surface-muted">
              {[group.city, group.state].filter(Boolean).join(", ")}
            </p>
          )}
          {group.description && (
            <p className="mt-1 text-surface-muted">{group.description}</p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span className={group.visibility === "private" ? "badge-gray" : "badge-green"}>
            {group.visibility === "private" ? "Private" : "Public"}
          </span>

          {isMember ? (
            <>
              <span className="badge-green">Member</span>
              {/* Invite button available to all members of any group */}
              <InviteButton
                groupId={group.id}
                groupSlug={slug}
                groupName={group.name}
                groupVisibility={group.visibility}
              />
            </>
          ) : canJoin ? (
            /* Non-member who can join (public group, or private via valid token) */
            user && profile ? (
              <JoinButton
                groupId={group.id}
                playerId={profile.id}
                groupType={group.group_type}
                slug={slug}
              />
            ) : (
              /* Unauthenticated — redirect to login, then back here */
              <Link
                href={`/login?next=${encodeURIComponent(nextUrl)}`}
                className="btn-primary"
              >
                Join Group
              </Link>
            )
          ) : null}

          {isMember && (
            <Link href={`/groups/${slug}/forum`} className="btn-secondary">
              Forum
            </Link>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="card">
          <p className="text-sm text-surface-muted">Members</p>
          <p className="mt-1 text-2xl font-bold text-dark-100">
            {members.length}
          </p>
        </div>
        <div className="card">
          <p className="text-sm text-surface-muted">Upcoming Events</p>
          <p className="mt-1 text-2xl font-bold text-dark-100">
            {sheets.length}
          </p>
        </div>
        <Link
          href={`/groups/${slug}/ladder`}
          className="card hover:ring-brand-500/30 hover:ring-2 transition-shadow flex flex-col items-center justify-center text-center"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-6 w-6 text-brand-400 mb-1">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
          </svg>
          <p className="text-sm font-semibold text-brand-400">
            View {isFreePlay ? "Standings" : "Rankings"}
          </p>
        </Link>
      </div>

      {/* Free Play: Session + Standings */}
      {isFreePlay && isMember && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-3">
            <Link
              href={`/groups/${slug}/session`}
              className={activeSessionId ? "btn-primary" : "btn-primary"}
            >
              {activeSessionId ? "Continue Session" : "Start Session"}
            </Link>
            <ResetStatsButton groupId={group.id} />
          </div>
          {isGroupAdmin && (
            <RollingSessionsSetting
              groupId={group.id}
              currentValue={group.rolling_sessions_count ?? 14}
            />
          )}
        </div>
      )}

      {isFreePlay && playerStats.length > 0 && (
        <section>
          <h2 className="mb-4 text-lg font-semibold text-dark-100">
            Standings
          </h2>
          <FreePlayLeaderboard
            stats={playerStats as any}
            currentPlayerId={profile?.id}
          />
        </section>
      )}

      {isFreePlay && recentMatches.length > 0 && (
        <section>
          <h2 className="mb-4 text-lg font-semibold text-dark-100">
            Recent Matches
          </h2>
          <div className="space-y-2">
            {recentMatches.map((match) => (
              <div
                key={match.id}
                className="card flex items-center justify-between"
              >
                <div className="text-sm">
                  <span className="font-medium text-dark-100">
                    {match.team_a_p1_profile?.display_name}
                    {match.team_a_p2_profile &&
                      ` & ${match.team_a_p2_profile.display_name}`}
                  </span>
                  <span className="text-surface-muted"> vs </span>
                  <span className="font-medium text-dark-100">
                    {match.team_b_p1_profile?.display_name}
                    {match.team_b_p2_profile &&
                      ` & ${match.team_b_p2_profile.display_name}`}
                  </span>
                </div>
                <div className="text-sm font-bold">
                  <span
                    className={
                      match.score_a > match.score_b
                        ? "text-teal-300"
                        : "text-dark-200"
                    }
                  >
                    {match.score_a}
                  </span>
                  <span className="text-surface-muted mx-1">-</span>
                  <span
                    className={
                      match.score_b > match.score_a
                        ? "text-teal-300"
                        : "text-dark-200"
                    }
                  >
                    {match.score_b}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Upcoming Sheets */}
      {sheets.length > 0 && (
        <section>
          <h2 className="mb-4 text-lg font-semibold text-dark-100">
            Upcoming Events
          </h2>
          <div className="space-y-3">
            {sheets.map((sheet) => (
              <Link
                key={sheet.id}
                href={`/sheets/${sheet.id}`}
                className="card flex items-center justify-between hover:ring-brand-500/30 transition-shadow"
              >
                <div>
                  <p className="font-medium text-dark-100">
                    {formatDate(sheet.event_date)}
                  </p>
                  <p className="text-sm text-surface-muted">
                    {formatTime(sheet.event_time)} at {sheet.location}
                  </p>
                </div>
                <span className="badge-green">Open</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Members */}
      <section>
        <h2 className="mb-4 text-lg font-semibold text-dark-100">
          Members ({members.length})
        </h2>

        {/* Mobile: card list */}
        <div className="space-y-2 sm:hidden">
          {members.map((member, index) => (
            <div
              key={member.player_id}
              className={cn(
                "card flex items-center gap-3",
                member.player_id === profile?.id && "ring-2 ring-brand-500/40"
              )}
            >
              <span className="text-sm font-medium text-surface-muted w-5 text-center shrink-0">
                {index + 1}
              </span>
              {member.player?.avatar_url ? (
                <img
                  src={member.player.avatar_url}
                  alt=""
                  className="h-8 w-8 rounded-full object-cover shrink-0"
                />
              ) : (
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-overlay text-xs font-medium text-surface-muted shrink-0">
                  {member.player?.display_name?.charAt(0) ?? "?"}
                </div>
              )}
              <span className="text-sm font-medium text-dark-100 truncate flex-1 min-w-0">
                {member.player?.display_name}
              </span>
              {!isFreePlay && (
                <span className="text-xs text-surface-muted shrink-0">
                  Step {member.current_step} &middot; {member.win_pct}%
                </span>
              )}
            </div>
          ))}
          {members.length === 0 && (
            <div className="card py-8 text-center text-sm text-surface-muted">
              No members yet.
            </div>
          )}
        </div>

        {/* Desktop: table */}
        <div className="card overflow-hidden p-0 hidden sm:block">
          <div className="max-h-[32rem] overflow-y-auto">
            <table className="min-w-full divide-y divide-surface-border">
              <thead className="bg-surface-overlay sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-surface-muted">
                    #
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-surface-muted">
                    Player
                  </th>
                  {!isFreePlay && (
                    <>
                      <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-surface-muted">
                        Step
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-surface-muted">
                        Win %
                      </th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border bg-surface-raised">
                {members.map((member, index) => (
                  <tr
                    key={member.player_id}
                    className={cn(
                      member.player_id === profile?.id && "bg-brand-900/40"
                    )}
                  >
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-surface-muted">
                      {index + 1}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <div className="flex items-center gap-3">
                        {member.player?.avatar_url ? (
                          <img
                            src={member.player.avatar_url}
                            alt=""
                            className="h-8 w-8 rounded-full object-cover"
                          />
                        ) : (
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-overlay text-xs font-medium text-surface-muted">
                            {member.player?.display_name?.charAt(0) ?? "?"}
                          </div>
                        )}
                        <span className="text-sm font-medium text-dark-100">
                          {member.player?.display_name}
                        </span>
                      </div>
                    </td>
                    {!isFreePlay && (
                      <>
                        <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-dark-100">
                          {member.current_step}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-dark-100">
                          {member.win_pct}%
                        </td>
                      </>
                    )}
                  </tr>
                ))}
                {members.length === 0 && (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-4 py-8 text-center text-sm text-surface-muted"
                    >
                      No members yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}

// ============================================================
// Join Button (Server Action)
// ============================================================

function JoinButton({
  groupId,
  playerId,
  groupType,
  slug,
}: {
  groupId: string;
  playerId: string;
  groupType: string;
  slug: string;
}) {
  async function join() {
    "use server";

    const supabase = await createClient();

    let startStep = 5;
    if (groupType === "ladder_league") {
      const { data: prefs } = await supabase
        .from("group_preferences")
        .select("new_player_start_step")
        .eq("group_id", groupId)
        .single();
      startStep = prefs?.new_player_start_step ?? 5;
    }

    // Use service client to bypass RLS for membership insert
    const serviceClient = await createServiceClient();
    await serviceClient.from("group_memberships").upsert(
      {
        group_id: groupId,
        player_id: playerId,
        current_step: startStep,
        win_pct: 0,
        total_sessions: 0,
      },
      { onConflict: "group_id,player_id" }
    );

    const { revalidatePath } = await import("next/cache");
    const { redirect } = await import("next/navigation");
    revalidatePath(`/groups/${slug}`);
    revalidatePath("/groups");
    redirect(`/groups/${slug}`);
  }

  return (
    <form action={join}>
      <button type="submit" className="btn-primary">
        Join Group
      </button>
    </form>
  );
}
