import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import Link from "next/link";
import { GroupList, type GroupCardData } from "./group-list";

export default async function GroupsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Get current player's profile (may be null for unauthenticated visitors)
  let profile: { id: string } | null = null;
  if (user) {
    const { data } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", user.id)
      .single();
    profile = data;
  }

  // Fetch all active groups with member counts
  const { data: groups } = await supabase
    .from("shootout_groups")
    .select("*, group_memberships(count)")
    .eq("is_active", true)
    .order("name", { ascending: true });

  // Fetch current user's memberships to mark joined groups
  let joinedGroupIds = new Set<string>();
  if (profile) {
    const { data: myMemberships } = await supabase
      .from("group_memberships")
      .select("group_id")
      .eq("player_id", profile.id);
    joinedGroupIds = new Set(myMemberships?.map((m) => m.group_id) ?? []);
  }

  const groupCards: GroupCardData[] = (groups ?? []).map((group) => ({
    id: group.id,
    name: group.name,
    slug: group.slug,
    description: group.description,
    group_type: group.group_type,
    visibility: group.visibility,
    city: group.city,
    state: group.state,
    memberCount:
      (group.group_memberships as unknown as { count: number }[])?.[0]?.count ??
      0,
    isJoined: joinedGroupIds.has(group.id),
  }));

  async function joinGroup(groupId: string, groupType: string) {
    "use server";

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data: p } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", user.id)
      .single();
    if (!p) return;

    let startStep = 5;
    if (groupType === "ladder_league") {
      const { data: prefs } = await supabase
        .from("group_preferences")
        .select("new_player_start_step")
        .eq("group_id", groupId)
        .single();
      startStep = prefs?.new_player_start_step ?? 5;
    }

    await supabase.from("group_memberships").upsert(
      {
        group_id: groupId,
        player_id: p.id,
        current_step: startStep,
        win_pct: 0,
        total_sessions: 0,
      },
      { onConflict: "group_id,player_id", ignoreDuplicates: true }
    );

    revalidatePath("/groups");
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-dark-100">Browse Groups</h1>
          <p className="mt-1 text-surface-muted">
            Find a shootout group to join and start competing.
          </p>
        </div>
        <Link href="/groups/new" className="btn-primary whitespace-nowrap">
          Create a Group
        </Link>
      </div>

      <GroupList
        groups={groupCards}
        playerId={profile?.id ?? null}
        joinAction={joinGroup}
      />
    </div>
  );
}
