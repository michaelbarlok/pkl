import { createClient } from "@/lib/supabase/server";
import { getGroupBySlug, getGroupMembers } from "@/lib/queries/group";
import { getPlayerStats } from "@/lib/queries/free-play";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cn, formatDate } from "@/lib/utils";
import { FreePlayLeaderboard } from "../leaderboard";

export default async function LadderPage({
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

  const isFreePlay = group.group_type === "free_play";

  // getGroupMembers already sorts by ranking sheet order
  const members = isFreePlay ? [] : await getGroupMembers(group.id);
  const playerStats = isFreePlay ? await getPlayerStats(group.id) : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <Link
            href="/groups"
            className="text-sm text-surface-muted hover:text-dark-200"
          >
            Groups
          </Link>
          <span className="text-sm text-surface-muted">/</span>
          <Link
            href={`/groups/${slug}`}
            className="text-sm text-surface-muted hover:text-dark-200"
          >
            {group.name}
          </Link>
          <span className="text-sm text-surface-muted">/</span>
        </div>
        <h1 className="mt-1 text-2xl font-bold text-dark-100">
          {group.name} {isFreePlay ? "Leaderboard" : "Ladder"}
        </h1>
        <p className="mt-1 text-surface-muted">
          {isFreePlay
            ? "Standings sorted by wins and point differential."
            : "Rankings sorted by Step, Win %, Last Played, and Sessions."}
        </p>
      </div>

      {/* Free Play Leaderboard */}
      {isFreePlay && (
        <FreePlayLeaderboard stats={playerStats as any} currentPlayerId={profile?.id} />
      )}

      {/* Ladder Table (Ladder League only) */}
      {!isFreePlay && <div className="card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-surface-border">
            <thead className="bg-surface-overlay">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-surface-muted">
                  Rank
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-surface-muted">
                  Player
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-surface-muted">
                  Step
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-surface-muted">
                  Win %
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-surface-muted">
                  Sessions
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-surface-muted">
                  Last Played
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border bg-surface-raised">
              {members.map((member, index) => (
                <tr
                  key={member.player_id}
                  className={cn(
                    member.player_id === profile?.id &&
                      "bg-brand-900/40 font-medium"
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
                      <span className="text-sm text-dark-100">
                        {member.player?.display_name}
                      </span>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-dark-100">
                    {member.current_step}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-dark-100">
                    {member.win_pct}%
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-dark-100">
                    {member.total_sessions}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-surface-muted">
                    {member.last_played_at
                      ? formatDate(member.last_played_at)
                      : "Never"}
                  </td>
                </tr>
              ))}
              {members.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-8 text-center text-sm text-surface-muted"
                  >
                    No members in this group yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>}
    </div>
  );
}
