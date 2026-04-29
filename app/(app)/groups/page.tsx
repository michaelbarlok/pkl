import { createClient, createServiceClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import Link from "next/link";
import { GroupList, type GroupCardData } from "./group-list";
import { WeatherBadge } from "@/components/weather-badge";

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

  // Fetch all active groups with member counts and recurring schedule
  const { data: groups } = await supabase
    .from("shootout_groups")
    .select("*, group_memberships(count), group_recurring_schedules(day_of_week, event_time, timezone, location, is_active)")
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

  const groupCards: GroupCardData[] = (groups ?? []).map((group) => {
    const active = ((group.group_recurring_schedules as unknown as Array<{
      day_of_week: number;
      event_time: string;
      timezone: string | null;
      location: string;
      is_active: boolean;
    }>) ?? [])
      .filter((s) => s.is_active)
      .sort((a, b) =>
        a.day_of_week === b.day_of_week
          ? a.event_time.localeCompare(b.event_time)
          : a.day_of_week - b.day_of_week
      );
    return {
      id: group.id,
      name: group.name,
      slug: group.slug,
      description: group.description,
      group_type: group.group_type,
      visibility: group.visibility,
      city: group.city,
      state: group.state,
      memberCount:
        (group.group_memberships as unknown as { count: number }[])?.[0]?.count ?? 0,
      isJoined: joinedGroupIds.has(group.id),
      playTimes: active.map((s) => ({
        day_of_week: s.day_of_week,
        event_time: s.event_time,
        timezone: s.timezone ?? "America/New_York",
        location: s.location,
      })),
    };
  });

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

    // Use service client to bypass RLS for membership insert
    const serviceClient = await createServiceClient();
    await serviceClient.from("group_memberships").upsert(
      {
        group_id: groupId,
        player_id: p.id,
        current_step: startStep,
        win_pct: 0,
        total_sessions: 0,
      },
      { onConflict: "group_id,player_id" }
    );

    revalidatePath("/groups");
  }

  // Pre-render a weather chip per group, keyed by group id, for the
  // group's NEXT upcoming sheet inside the 5-day window. The
  // WeatherBadge itself returns null if no usable forecast exists,
  // so groups with no upcoming sheet (or one outside the 5-day
  // window) silently render nothing. One small DB read for all
  // groups, plus the weather lookups (themselves cached).
  const groupIds = groupCards.map((g) => g.id);
  const fiveDaysIso = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
  const { data: nextSheets } = groupIds.length
    ? await supabase
        .from("signup_sheets")
        .select("group_id, event_time, location")
        .in("group_id", groupIds)
        .gte("event_time", new Date().toISOString())
        .lte("event_time", fiveDaysIso)
        .neq("status", "cancelled")
        .order("event_time", { ascending: true })
    : { data: null };

  const earliestPerGroup = new Map<string, { event_time: string; location: string }>();
  for (const s of (nextSheets ?? []) as Array<{ group_id: string; event_time: string; location: string }>) {
    if (!earliestPerGroup.has(s.group_id)) {
      earliestPerGroup.set(s.group_id, { event_time: s.event_time, location: s.location });
    }
  }

  const weatherByGroupId: Record<string, React.ReactNode> = {};
  for (const [groupId, sheet] of earliestPerGroup) {
    weatherByGroupId[groupId] = (
      <WeatherBadge location={sheet.location} eventTime={sheet.event_time} />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-2xl font-bold text-dark-100">Groups</h1>
        <Link href="/groups/new" className="btn-primary whitespace-nowrap">
          Create a Group
        </Link>
      </div>

      <GroupList
        groups={groupCards}
        playerId={profile?.id ?? null}
        joinAction={joinGroup}
        weatherByGroupId={weatherByGroupId}
      />
    </div>
  );
}
