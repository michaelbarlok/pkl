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
            ? "Standings sorted by wins, then point differential."
            : "Rankings sorted by Step, then Pt %."}
        </p>
      </div>

      {/* Free Play Leaderboard */}
      {isFreePlay && (
        <FreePlayLeaderboard stats={playerStats as any} currentPlayerId={profile?.id} />
      )}

      {/* Ladder List (Ladder League only) */}
      {!isFreePlay && (
        <div className="card overflow-hidden p-0">
          {members.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-surface-muted">
              No members in this group yet.
            </p>
          ) : (
            <ul className="divide-y divide-surface-border">
              {members.map((member, index) => (
                <li
                  key={member.player_id}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3",
                    member.player_id === profile?.id && "bg-brand-900/40"
                  )}
                >
                  {/* Rank */}
                  <span className="w-6 shrink-0 text-sm text-surface-muted text-center">
                    {index + 1}
                  </span>

                  {/* Avatar */}
                  {member.player?.avatar_url ? (
                    <img
                      src={member.player.avatar_url}
                      alt=""
                      className="h-9 w-9 rounded-full object-cover shrink-0"
                    />
                  ) : (
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-overlay text-xs font-medium text-surface-muted shrink-0">
                      {member.player?.display_name?.charAt(0) ?? "?"}
                    </div>
                  )}

                  {/* Name + subheading */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-dark-100 truncate">
                      {member.player?.display_name}
                    </p>
                    <p className="text-xs text-surface-muted mt-0.5">
                      {member.total_sessions} session{member.total_sessions !== 1 ? "s" : ""} &middot;{" "}
                      {member.last_played_at ? formatDate(member.last_played_at) : "Never played"}
                    </p>
                  </div>

                  {/* Step + Pt% */}
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold text-dark-100">Step {member.current_step}</p>
                    <p className="text-xs text-surface-muted">{member.win_pct}% Pt</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
