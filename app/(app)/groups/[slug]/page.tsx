import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getGroupMembers, getGroupSheets, isGroupMember } from "@/lib/queries/group";
import { getRecentMatches, getPlayerStats, getRecentSessions } from "@/lib/queries/free-play";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cn } from "@/lib/utils";
import { formatDateInZone, formatTimeInZone } from "@/lib/utils";
import { FreePlayLeaderboard } from "./leaderboard";
import { InviteButton } from "./invite-button";
import { ResetStatsButton } from "./reset-stats-button";
import { RollingSessionsSetting } from "./rolling-sessions-setting";
import { CollapsibleMembers } from "./collapsible-members";
import type { GroupWithPreferences } from "@/lib/queries/group";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

type UpcomingEvent =
  | { kind: "sheet"; key: string; sortAt: string; sheet: { id: string; event_time: string; timezone: string; location: string } }
  | { kind: "pending"; key: string; sortAt: string; event_date: string; event_time_local: string; timezone: string; location: string };

/**
 * Figure out the calendar date (YYYY-MM-DD, in the given IANA zone) of the
 * next occurrence of `playDow` on or after today in that zone, with an
 * optional weekOffset to look further ahead.
 */
function nextLocalDate(playDow: number, tz: string, weekOffset = 0): string {
  const now = new Date();
  const todayLocal = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(now); // YYYY-MM-DD
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(now);
  const SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const todayDow = SHORT.findIndex((d) => weekday.startsWith(d));
  const delta = (playDow - todayDow + 7) % 7;
  const base = new Date(todayLocal + "T00:00:00Z");
  base.setUTCDate(base.getUTCDate() + delta + weekOffset * 7);
  return base.toISOString().split("T")[0];
}

/**
 * Merge posted sheets with the next occurrences of active play times so the
 * Upcoming Events card shows the whole near-term calendar — posted or not.
 */
function buildUpcomingEvents(
  sheets: Array<{ id: string; event_date: string; event_time: string; timezone: string; location: string }>,
  playTimes: Array<{ id: string; day_of_week: number; event_time: string; timezone: string; location: string }>
): UpcomingEvent[] {
  const WEEKS_AHEAD = 2;

  // Existing sheets first. Key on (event_date, local HH:MM) so we can match
  // a pending occurrence against a posted sheet without timezone arithmetic.
  const byKey = new Map<string, UpcomingEvent>();
  for (const s of sheets) {
    const localTime = new Intl.DateTimeFormat("en-US", {
      timeZone: s.timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(s.event_time));
    const key = `${s.event_date}__${localTime}`;
    byKey.set(key, {
      kind: "sheet",
      key,
      sortAt: s.event_time,
      sheet: { id: s.id, event_time: s.event_time, timezone: s.timezone, location: s.location },
    });
  }

  // Overlay the next N occurrences of every active play time that doesn't
  // already have a sheet.
  for (const pt of playTimes) {
    const hhmm = pt.event_time.slice(0, 5);
    for (let w = 0; w < WEEKS_AHEAD; w++) {
      const eventDate = nextLocalDate(pt.day_of_week, pt.timezone, w);
      const key = `${eventDate}__${hhmm}`;
      if (byKey.has(key)) continue;
      byKey.set(key, {
        kind: "pending",
        key,
        sortAt: `${eventDate}T${hhmm}:00`,
        event_date: eventDate,
        event_time_local: hhmm,
        timezone: pt.timezone,
        location: pt.location,
      });
    }
  }

  return Array.from(byKey.values()).sort((a, b) => a.sortAt.localeCompare(b.sortAt));
}

function PlayTimeDisplay({ playTime }: {
  playTime: { label?: string | null; day_of_week: number; event_time: string; timezone: string; location: string; player_limit: number };
}) {
  const [hStr, mStr] = playTime.event_time.slice(0, 5).split(":");
  const h = parseInt(hStr, 10);
  const time12 = `${h === 0 ? 12 : h > 12 ? h - 12 : h}:${mStr} ${h >= 12 ? "pm" : "am"}`;
  const tzAbbr = new Intl.DateTimeFormat("en-US", { timeZone: playTime.timezone, timeZoneName: "short" })
    .formatToParts(new Date())
    .find((p) => p.type === "timeZoneName")?.value ?? "";

  return (
    <div className="rounded-lg border border-surface-border/40 bg-surface-card/30 px-3 py-2">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-dark-100">
        <svg className="h-4 w-4 shrink-0 text-brand-vivid" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z" />
        </svg>
        <span>
          {playTime.label?.trim() || `${DAY_NAMES[playTime.day_of_week]}s`}
          <span className="ml-2 text-surface-muted font-normal">{time12} {tzAbbr}</span>
        </span>
      </p>
      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 pl-5 text-xs text-surface-muted">
        {playTime.location && (
          <span className="flex items-center gap-1">
            <svg className="h-3.5 w-3.5 shrink-0 text-brand-vivid" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
            </svg>
            <span className="truncate">{playTime.location}</span>
          </span>
        )}
        {playTime.player_limit && (
          <span className="flex items-center gap-1">
            <svg className="h-3.5 w-3.5 shrink-0 text-brand-vivid" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
            </svg>
            <span>Max {playTime.player_limit}</span>
          </span>
        )}
      </div>
    </div>
  );
}

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

  // Build mailto: link for all group admins
  const adminEmails = members
    .filter((m) => (m as any).group_role === "admin" && (m as any).player?.email)
    .map((m) => (m as any).player.email as string);
  const contactAdminsHref = adminEmails.length > 0
    ? `mailto:${adminEmails.join(",")}?subject=${encodeURIComponent(`Question about ${group.name}`)}`
    : null;

  // Fetch active play times for display (a group may have several)
  const { data: playTimesData } = await supabase
    .from("group_recurring_schedules")
    .select("id, label, day_of_week, event_time, timezone, location, player_limit, is_active")
    .eq("group_id", group.id)
    .eq("is_active", true)
    .order("day_of_week", { ascending: true })
    .order("event_time", { ascending: true });
  const playTimes = playTimesData ?? [];

  // Build the "Upcoming Events" list: every posted sheet, plus the next
  // occurrence of each active play time that doesn't have a sheet yet.
  // Covers the next two weeks so admins can see both the posted Wednesday
  // and the upcoming-but-not-yet-posted Friday side by side.
  const upcomingEvents = buildUpcomingEvents(sheets, playTimes);

  const recentMatches = isFreePlay ? await getRecentMatches(group.id, 10) : [];
  const playerStats = isFreePlay ? await getPlayerStats(group.id) : [];
  const recentSessions = isFreePlay ? await getRecentSessions(group.id, 10) : [];

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

          {/* Play Time */}
          {playTimes.length > 0 && (
            <div className="mt-3 space-y-2">
              {playTimes.map((pt) => (
                <PlayTimeDisplay key={pt.id} playTime={pt} />
              ))}
            </div>
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
          {isMember && contactAdminsHref && (
            <a href={contactAdminsHref} className="btn-secondary text-xs">
              Contact Admins
            </a>
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

          {/* Upcoming Events — posted sheets and the next occurrences of each play time */}
          <div className="card card-static">
            <p className="text-sm text-surface-muted mb-2">Upcoming Events</p>
            {upcomingEvents.length === 0 ? (
              <p className="text-sm text-surface-muted italic">None scheduled</p>
            ) : (
              <ul className="space-y-1.5">
                {upcomingEvents.map((ev) =>
                  ev.kind === "sheet" ? (
                    <li key={ev.key}>
                      <Link
                        href={`/sheets/${ev.sheet.id}`}
                        className="flex flex-col hover:text-brand-400 transition-colors group"
                      >
                        <span className="text-sm font-medium text-dark-100 group-hover:text-brand-400">
                          {formatDateInZone(ev.sheet.event_time, ev.sheet.timezone)}
                        </span>
                        <span className="text-xs text-surface-muted">
                          {formatTimeInZone(ev.sheet.event_time, ev.sheet.timezone)} · {ev.sheet.location}
                        </span>
                      </Link>
                    </li>
                  ) : (
                    <li key={ev.key} className="flex flex-col opacity-80">
                      <span className="text-sm font-medium text-dark-200">
                        {formatDateInZone(ev.event_date, ev.timezone)}
                      </span>
                      <span className="text-xs text-surface-muted">
                        {formatTimeInZone(ev.event_time_local, ev.timezone)} · {ev.location} · <span className="italic">sheet not yet posted</span>
                      </span>
                    </li>
                  )
                )}
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


      {isFreePlay && isMember && recentSessions.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-dark-100">Past Sessions</h2>
          <div className="space-y-2">
            {recentSessions.map((s) => {
              const date = new Date(s.created_at).toLocaleDateString("en-US", {
                weekday: "short",
                month: "short",
                day: "numeric",
              });
              return (
                <Link
                  key={s.id}
                  href={`/groups/${slug}/sessions/${s.id}`}
                  className="card flex items-center justify-between hover:bg-surface-overlay transition-colors"
                >
                  <div>
                    <p className="text-sm font-medium text-dark-100">{date}</p>
                    <p className="text-xs text-surface-muted mt-0.5">
                      {s.round_number} round{s.round_number !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <svg className="h-4 w-4 text-surface-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m9 18 6-6-6-6" />
                  </svg>
                </Link>
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
