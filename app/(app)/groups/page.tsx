import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { cn } from "@/lib/utils";

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Browse Groups</h1>
        <p className="mt-1 text-gray-600">
          Find a shootout group to join and start competing.
        </p>
      </div>

      {groups && groups.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((group) => {
            const memberCount =
              (group.group_memberships as unknown as { count: number }[])?.[0]
                ?.count ?? 0;
            const isJoined = joinedGroupIds.has(group.id);

            return (
              <Link
                key={group.id}
                href={`/groups/${group.slug}`}
                className={cn(
                  "card hover:ring-brand-300 transition-shadow",
                  isJoined && "ring-2 ring-brand-200"
                )}
              >
                <div className="flex items-start justify-between">
                  <h3 className="font-semibold text-gray-900">{group.name}</h3>
                  {isJoined && <span className="badge-green">Joined</span>}
                </div>
                {group.description && (
                  <p className="mt-1 text-sm text-gray-600 line-clamp-2">
                    {group.description}
                  </p>
                )}
                <div className="mt-3 flex items-center gap-2 text-sm text-gray-500">
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"
                    />
                  </svg>
                  <span>
                    {memberCount} {memberCount === 1 ? "member" : "members"}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="card text-center text-gray-500">
          No active groups available.
        </div>
      )}
    </div>
  );
}
