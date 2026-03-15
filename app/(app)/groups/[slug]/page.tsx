import { createClient } from "@/lib/supabase/server";
import { getGroupBySlug, getGroupMembers, getGroupSheets, isGroupMember } from "@/lib/queries/group";
import { getRecentMatches, getPlayerStats } from "@/lib/queries/free-play";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cn } from "@/lib/utils";
import { formatDate, formatTime } from "@/lib/utils";
import { LogMatchForm } from "./log-match";
import { FreePlayLeaderboard } from "./leaderboard";
import { InviteButton } from "./invite-button";

export default async function GroupPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", user!.id)
    .single();

  const group = await getGroupBySlug(slug);
  if (!group) notFound();

  const members = await getGroupMembers(group.id);
  const sheets = await getGroupSheets(group.id);
  const isMember = profile ? await isGroupMember(group.id, profile.id) : false;

  const isFreePlay = group.group_type === "free_play";

  // Fetch free play data if applicable
  const recentMatches = isFreePlay ? await getRecentMatches(group.id, 10) : [];
  const playerStats = isFreePlay ? await getPlayerStats(group.id) : [];

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
        <div className="flex items-center gap-3">
          <span className={group.visibility === "private" ? "badge-gray" : "badge-green"}>
            {group.visibility === "private" ? "Private" : "Public"}
          </span>
          {isMember && (
            <Link
              href={`/groups/${slug}/forum`}
              className="btn-secondary"
            >
              Forum
            </Link>
          )}
          {isMember ? (
            <>
              <span className="badge-green">Member</span>
              {group.visibility === "private" && (
                <InviteButton groupId={group.id} groupType={group.group_type} />
              )}
            </>
          ) : (
            group.visibility === "public" && (
              <JoinButton groupId={group.id} playerId={profile!.id} groupType={group.group_type} />
            )
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
          className="card hover:ring-brand-500/30 transition-shadow"
        >
          <p className="text-sm text-surface-muted">
            {isFreePlay ? "Leaderboard" : "Ladder"}
          </p>
          <p className="mt-1 text-sm font-medium text-brand-600">
            View full {isFreePlay ? "standings" : "rankings"} &rarr;
          </p>
        </Link>
      </div>

      {/* Free Play: Log Match + Recent Matches */}
      {isFreePlay && isMember && (
        <LogMatchForm groupId={group.id} members={members as any} />
      )}

      {isFreePlay && playerStats.length > 0 && (
        <section>
          <h2 className="mb-4 text-lg font-semibold text-dark-100">
            Standings
          </h2>
          <FreePlayLeaderboard stats={playerStats as any} currentPlayerId={profile?.id} />
        </section>
      )}

      {isFreePlay && recentMatches.length > 0 && (
        <section>
          <h2 className="mb-4 text-lg font-semibold text-dark-100">
            Recent Matches
          </h2>
          <div className="space-y-2">
            {recentMatches.map((match) => (
              <div key={match.id} className="card flex items-center justify-between">
                <div className="text-sm">
                  <span className="font-medium text-dark-100">
                    {match.team_a_p1_profile?.display_name}
                    {match.team_a_p2_profile && ` & ${match.team_a_p2_profile.display_name}`}
                  </span>
                  <span className="text-surface-muted"> vs </span>
                  <span className="font-medium text-dark-100">
                    {match.team_b_p1_profile?.display_name}
                    {match.team_b_p2_profile && ` & ${match.team_b_p2_profile.display_name}`}
                  </span>
                </div>
                <div className="text-sm font-bold">
                  <span className={match.score_a > match.score_b ? "text-teal-300" : "text-dark-200"}>
                    {match.score_a}
                  </span>
                  <span className="text-surface-muted mx-1">-</span>
                  <span className={match.score_b > match.score_a ? "text-teal-300" : "text-dark-200"}>
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
        <div className="card overflow-hidden p-0">
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
// Join Button (Client Component inline)
// ============================================================

function JoinButton({
  groupId,
  playerId,
  groupType,
}: {
  groupId: string;
  playerId: string;
  groupType: string;
}) {
  async function requestToJoin() {
    "use server";

    const supabase = await createClient();

    let startStep = 5;
    if (groupType === "ladder_league") {
      // Fetch group preferences for start step
      const { data: prefs } = await supabase
        .from("group_preferences")
        .select("new_player_start_step")
        .eq("group_id", groupId)
        .single();
      startStep = prefs?.new_player_start_step ?? 5;
    }

    await supabase.from("group_memberships").insert({
      group_id: groupId,
      player_id: playerId,
      current_step: startStep,
      win_pct: 0,
      total_sessions: 0,
    });

    const { revalidatePath } = await import("next/cache");
    revalidatePath(`/groups`);
  }

  return (
    <form action={requestToJoin}>
      <button type="submit" className="btn-primary">
        Request to Join
      </button>
    </form>
  );
}
