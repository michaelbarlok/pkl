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

  // Fetch active session (player is checked in, session is not complete)
  const { data: activeParticipant } = await supabase
    .from("session_participants")
    .select("session_id, court_number, session:shootout_sessions(id, status, num_courts, group:shootout_groups(name), sheet:signup_sheets(event_date, location))")
    .eq("player_id", profile.id)
    .eq("checked_in", true)
    .limit(10);

  const activeSession = activeParticipant?.find((p: any) => {
    const status = p.session?.status;
    return status && !["session_complete", "created"].includes(status);
  }) as any;

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

      {/* Active Session Banner */}
      {activeSession?.session && (
        <Link
          href={`/sessions/${activeSession.session_id}`}
          className="card flex items-center justify-between bg-teal-900/30 border border-teal-500/30 hover:border-teal-500/50 transition-colors"
        >
          <div>
            <p className="text-sm font-semibold text-teal-300">Active Session</p>
            <p className="text-lg font-bold text-dark-100">
              {activeSession.session.group?.name ?? "Shootout"}
              {activeSession.court_number && ` — Court ${activeSession.court_number}`}
            </p>
            <p className="text-xs text-surface-muted">
              {activeSession.session.sheet?.location ?? ""}
            </p>
          </div>
          <div className="flex items-center gap-2 text-teal-300">
            <span className="text-sm font-medium">Go to session</span>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
              <path fillRule="evenodd" d="M3 10a.75.75 0 0 1 .75-.75h10.638L10.23 5.29a.75.75 0 1 1 1.04-1.08l5.5 5.25a.75.75 0 0 1 0 1.08l-5.5 5.25a.75.75 0 1 1-1.04-1.08l4.158-3.96H3.75A.75.75 0 0 1 3 10Z" clipRule="evenodd" />
            </svg>
          </div>
        </Link>
      )}

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
