import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function ForumPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!profile) redirect("/login");

  // Get groups the user is a member of
  const { data: memberships } = await supabase
    .from("group_memberships")
    .select("group:shootout_groups(name, slug)")
    .eq("player_id", profile.id);

  const groups = (memberships ?? [])
    .map((m: any) => m.group)
    .filter(Boolean);

  // If user is in exactly one group, redirect to that group's forum
  if (groups.length === 1) {
    redirect(`/groups/${groups[0].slug}/forum`);
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-dark-100">Forum</h1>
      <p className="text-surface-muted">
        Forum discussions are now part of each group. Select a group to view its forum.
      </p>

      <div className="space-y-3">
        {groups.map((group: any) => (
          <Link
            key={group.slug}
            href={`/groups/${group.slug}/forum`}
            className="card block hover:ring-brand-500/30 transition-shadow"
          >
            <h2 className="text-sm font-semibold text-dark-100">
              {group.name}
            </h2>
            <p className="mt-1 text-sm text-surface-muted">
              View forum &rarr;
            </p>
          </Link>
        ))}

        {groups.length === 0 && (
          <div className="text-center py-12 text-surface-muted">
            Join a group to participate in forum discussions.
          </div>
        )}
      </div>
    </div>
  );
}
