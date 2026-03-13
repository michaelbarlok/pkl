import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { notFound } from "next/navigation";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) notFound();

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", user.id)
    .single();

  if (!profile) notFound();

  // Fetch groups the player belongs to
  const { data: memberships } = await supabase
    .from("group_memberships")
    .select("*, group:shootout_groups(*)")
    .eq("player_id", profile.id);

  // Fetch upcoming sheets
  const { data: sheets } = await supabase
    .from("signup_sheets")
    .select("*, group:shootout_groups(name, slug)")
    .eq("status", "open")
    .order("event_date", { ascending: true })
    .limit(5);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-dark-100">
          Welcome back, {profile.display_name}
        </h1>
        <p className="mt-1 text-surface-muted">
          Here&apos;s what&apos;s happening in PKL.
        </p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="card">
          <p className="text-sm text-surface-muted">My Groups</p>
          <p className="mt-1 text-2xl font-bold text-dark-100">
            {memberships?.length ?? 0}
          </p>
        </div>
        <div className="card">
          <p className="text-sm text-surface-muted">Upcoming Events</p>
          <p className="mt-1 text-2xl font-bold text-dark-100">
            {sheets?.length ?? 0}
          </p>
        </div>
        <div className="card">
          <p className="text-sm text-surface-muted">Member Since</p>
          <p className="mt-1 text-2xl font-bold text-dark-100">
            {profile.member_since
              ? new Date(profile.member_since).toLocaleDateString("en-US", {
                  month: "short",
                  year: "numeric",
                })
              : "—"}
          </p>
        </div>
      </div>

      {/* My Groups */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-dark-100">My Groups</h2>
          <Link href="/groups" className="text-sm text-brand-600 hover:text-brand-500">
            Browse all groups
          </Link>
        </div>
        {memberships && memberships.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {memberships.map((m) => (
              <Link
                key={m.group_id}
                href={`/groups/${m.group?.slug}`}
                className="card hover:ring-brand-500/30 transition-shadow"
              >
                <h3 className="font-semibold text-dark-100">{m.group?.name}</h3>
                <div className="mt-2 flex gap-4 text-sm text-surface-muted">
                  <span>Step {m.current_step}</span>
                  <span>{m.win_pct}% Win</span>
                  <span>{m.total_sessions} sessions</span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="card text-center text-surface-muted">
            <p>You haven&apos;t joined any groups yet.</p>
            <Link href="/groups" className="mt-2 inline-block text-brand-600 hover:text-brand-500">
              Browse available groups
            </Link>
          </div>
        )}
      </section>

      {/* Upcoming Sign-Up Sheets */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-dark-100">Upcoming Events</h2>
          <Link href="/sheets" className="text-sm text-brand-600 hover:text-brand-500">
            View all sheets
          </Link>
        </div>
        {sheets && sheets.length > 0 ? (
          <div className="space-y-3">
            {sheets.map((sheet) => (
              <Link
                key={sheet.id}
                href={`/sheets/${sheet.id}`}
                className="card flex items-center justify-between hover:ring-brand-500/30 transition-shadow"
              >
                <div>
                  <p className="font-medium text-dark-100">
                    {sheet.group?.name ?? "Event"}
                  </p>
                  <p className="text-sm text-surface-muted">
                    {new Date(sheet.event_date).toLocaleDateString("en-US", {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })}
                    {" at "}
                    {sheet.location}
                  </p>
                </div>
                <span className="badge-green">Open</span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="card text-center text-surface-muted">
            No upcoming events.
          </div>
        )}
      </section>
    </div>
  );
}
