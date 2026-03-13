import { createClient } from "@/lib/supabase/server";
import { getGroupBySlug, getGroupMembers, getGroupSheets, isGroupMember } from "@/lib/queries/group";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/utils";

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

  // Show all members in a scrollable list

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
          {group.description && (
            <p className="mt-1 text-surface-muted">{group.description}</p>
          )}
        </div>
        <div className="flex items-center gap-3">
          {isMember ? (
            <span className="badge-green">Member</span>
          ) : (
            <JoinButton groupId={group.id} playerId={profile!.id} />
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
          <p className="text-sm text-surface-muted">Ladder</p>
          <p className="mt-1 text-sm font-medium text-brand-600">
            View full rankings &rarr;
          </p>
        </Link>
      </div>

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
                    {sheet.event_time} at {sheet.location}
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
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-surface-muted">
                    Step
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-surface-muted">
                    Win %
                  </th>
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
                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-dark-100">
                      {member.current_step}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-dark-100">
                      {member.win_pct}%
                    </td>
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
}: {
  groupId: string;
  playerId: string;
}) {
  async function requestToJoin() {
    "use server";

    const supabase = await createClient();

    // Fetch group preferences for start step
    const { data: prefs } = await supabase
      .from("group_preferences")
      .select("new_player_start_step")
      .eq("group_id", groupId)
      .single();

    const startStep = prefs?.new_player_start_step ?? 5;

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
