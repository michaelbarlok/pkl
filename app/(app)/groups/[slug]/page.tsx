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
import { CollapsibleMembers } from "./collapsible-members";
import { ContactOrganizersButton } from "@/components/contact-organizers-button";
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
          {isGroupAdmin && group.group_type === "ladder_league" && (
            <Link href={`/admin/sheets/new?groupId=${group.id}`} className="btn-primary">
              + Create Sheet
            </Link>
          )}
          {isGroupAdmin && (
            <Link href={`/admin/groups/${group.id}?tab=preferences`} className="btn-secondary">
              Group Settings
            </Link>
          )}
          {isMember && !isGroupAdmin && (
            <ContactOrganizersButton
              endpoint={`/api/groups/${group.id}/contact-admins`}
              label="Contact Admins"
            />
          )}
        </div>
      </div>

      {/* Stats (ladder league only) */}
      {!isFreePlay && (
        <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="card card-static">
            <p className="text-sm text-surface-muted">Members</p>
            <p className="mt-1 text-2xl font-bold text-dark-100">
              {members.length}
            </p>
          </div>

          {/* Upcoming Events — list with links instead of just a count */}
          <div className="card card-static">
            <p className="text-sm text-surface-muted mb-2">Upcoming Events</p>
            {sheets.length === 0 ? (
              <p className="text-sm text-surface-muted italic">None scheduled</p>
            ) : (
              <ul className="space-y-1.5">
                {sheets.map((sheet) => (
                  <li key={sheet.id}>
                    <Link
                      href={`/sheets/${sheet.id}`}
                      className="flex flex-col hover:text-brand-400 transition-colors group"
                    >
                      <span className="text-sm font-medium text-dark-100 group-hover:text-brand-400">
                        {formatDate(sheet.event_date)}
                      </span>
                      <span className="text-xs text-surface-muted">
                        {formatTime(sheet.event_time)} · {sheet.location}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <Link
            href={`/groups/${slug}/ladder`}
            className="card hover:ring-brand-500/30 hover:ring-2 transition-shadow flex flex-col items-center justify-center text-center"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-6 w-6 text-brand-400 mb-1">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
            </svg>
            <p className="text-sm font-semibold text-brand-400">
              View Rankings
            </p>
          </Link>
        </div>

        {/* Ladder mode note */}
        <div className="flex items-center gap-2 text-xs text-surface-muted">
          <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 4.5h14.25M3 9h9.75M3 13.5h9.75m4.5-4.5v12m0 0-3.75-3.75M17.25 21 21 17.25" />
          </svg>
          {group.ladder_type === "dynamic_ranking" ? (
            <span><span className="font-medium text-dark-300">Dynamic Ranking</span> — courts reset each session based on updated overall standings</span>
          ) : (
            <span><span className="font-medium text-dark-300">Court Promotion</span> — finish 1st to move up a court, last place moves down</span>
          )}
        </div>
        </div>
      )}

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
            {recentMatches.map((match) => {
              const aWon = match.score_a > match.score_b;
              const bWon = match.score_b > match.score_a;
              return (
              <div key={match.id} className="card p-0 overflow-hidden">
                <div className={`flex items-center justify-between gap-2 px-4 py-2.5 ${aWon ? "bg-teal-900/30" : "bg-surface-raised"}`}>
                  <span className={`text-sm truncate ${aWon ? "font-semibold text-teal-300" : "text-dark-300"}`}>
                    {aWon && <span className="mr-1">✓</span>}
                    {match.team_a_p1_profile?.display_name}
                    {match.team_a_p2_profile && ` & ${match.team_a_p2_profile.display_name}`}
                  </span>
                  <span className={`font-mono text-sm font-bold shrink-0 ${aWon ? "text-teal-300" : "text-dark-300"}`}>{match.score_a}</span>
                </div>
                <div className="h-px bg-surface-border" />
                <div className={`flex items-center justify-between gap-2 px-4 py-2.5 ${bWon ? "bg-teal-900/30" : "bg-surface-raised"}`}>
                  <span className={`text-sm truncate ${bWon ? "font-semibold text-teal-300" : "text-dark-300"}`}>
                    {bWon && <span className="mr-1">✓</span>}
                    {match.team_b_p1_profile?.display_name}
                    {match.team_b_p2_profile && ` & ${match.team_b_p2_profile.display_name}`}
                  </span>
                  <span className={`font-mono text-sm font-bold shrink-0 ${bWon ? "text-teal-300" : "text-dark-300"}`}>{match.score_b}</span>
                </div>
              </div>
              );
            })}
          </div>
        </section>
      )}


      {/* Members */}
      <CollapsibleMembers
        members={members as any}
        currentPlayerId={profile?.id ?? null}
        isFreePlay={isFreePlay}
      />
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
    const serviceClient = await createServiceClient();

    // Check if there's a pending record for this player in this group.
    // If so, use those stats instead of defaults so imported history is preserved.
    const { data: playerProfile } = await supabase
      .from("profiles")
      .select("display_name, email")
      .eq("id", playerId)
      .single();

    let usedPending = false;
    if (playerProfile) {
      const { claimPendingMemberships } = await import("@/lib/pending-memberships");
      const before = await serviceClient
        .from("group_memberships")
        .select("player_id")
        .eq("group_id", groupId)
        .eq("player_id", playerId)
        .maybeSingle();

      if (!before.data) {
        // Not yet a member — claimPendingMemberships will insert with pending stats
        await claimPendingMemberships(
          serviceClient,
          playerId,
          playerProfile.display_name,
          playerProfile.email,
          groupId
        );
        // Check if the claim created the membership
        const after = await serviceClient
          .from("group_memberships")
          .select("player_id")
          .eq("group_id", groupId)
          .eq("player_id", playerId)
          .maybeSingle();
        usedPending = !!after.data;
      }
    }

    // If no pending record handled the join, fall back to default insert
    if (!usedPending) {
      let startStep = 5;
      if (groupType === "ladder_league") {
        const { data: prefs } = await supabase
          .from("group_preferences")
          .select("new_player_start_step")
          .eq("group_id", groupId)
          .single();
        startStep = prefs?.new_player_start_step ?? 5;
      }

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
    }

    // Check community badges (non-blocking)
    const { checkAndAwardBadges } = await import("@/lib/badges");
    checkAndAwardBadges(playerId, ["community", "ladder"]).catch(() => {});

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
