import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import type { Profile, GroupMembership } from "@/types/database";
import { MembersTable } from "./members-table";

export default async function AdminMembersPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: currentProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", user.id)
    .single<Pick<Profile, "role">>();

  if (currentProfile?.role !== "admin") redirect("/");

  // Fetch all profiles
  const { data: profiles } = await supabase
    .from("profiles")
    .select("*")
    .order("display_name", { ascending: true })
    .returns<Profile[]>();

  // Fetch all group memberships to show step info
  const { data: allMemberships } = await supabase
    .from("group_memberships")
    .select("player_id, current_step, group:shootout_groups(name)")
    .returns<(Pick<GroupMembership, "player_id" | "current_step"> & { group: { name: string } | null })[]>();

  // Build a map of player_id -> memberships
  const membershipMap: Record<string, { step: number; groupName: string }[]> = {};
  if (allMemberships) {
    for (const m of allMemberships) {
      if (!membershipMap[m.player_id]) {
        membershipMap[m.player_id] = [];
      }
      membershipMap[m.player_id].push({
        step: m.current_step,
        groupName: m.group?.name ?? "Unknown",
      });
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-dark-100">Member Management</h1>
          <p className="mt-1 text-surface-muted">
            {profiles?.length ?? 0} total members
          </p>
        </div>
      </div>

      <MembersTable
        profiles={profiles ?? []}
        membershipMap={membershipMap}
      />
    </div>
  );
}
