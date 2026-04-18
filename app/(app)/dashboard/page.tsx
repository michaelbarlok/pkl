import { EmptyState } from "@/components/empty-state";
import { createClient } from "@/lib/supabase/server";
import { getBadgeStats } from "@/lib/queries/badges";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatDate, formatTime } from "@/lib/utils";

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

  const [
    { data: memberships },
    { data: sheets },
    { data: myTournamentRegs },
    { data: createdTournaments },
    { data: coOrgTournaments },
    { data: activeParticipant },
    badgeStats,
  ] = await Promise.all([
    supabase.from("group_memberships").select("*, group:shootout_groups(*)").eq("player_id", profile.id),
    supabase.from("signup_sheets").select("*, group:shootout_groups(name, slug, is_active)").eq("status", "open").order("event_date", { ascending: true }).limit(5),
    supabase.from("tournament_registrations").select("tournament_id, division, status, tournament:tournaments(id, title, start_date, start_time, location, status)").eq("player_id", profile.id).neq("status", "withdrawn"),
    supabase.from("tournaments").select("id, title, start_date, start_time, location, status").eq("created_by", profile.id).not("status", "in", '("completed","cancelled")'),
    supabase.from("tournament_organizers").select("tournament:tournaments(id, title, start_date, start_time, location, status)").eq("profile_id", profile.id),
    supabase.from("session_participants").select("session_id, court_number, session:shootout_sessions(id, status, num_courts, group:shootout_groups(name), sheet:signup_sheets(event_date, location))").eq("player_id", profile.id).eq("checked_in", true).limit(10),
    getBadgeStats(profile.id),
  ]);

  // Filter to active groups only
  const activeGroupMemberships = (memberships ?? []).filter((m) => (m as any).group?.is_active !== false);
  const activeSheets = (sheets ?? []).filter((s: any) => s.group?.is_active !== false);

  // Aggregate stats
  const totalSessions = activeGroupMemberships.reduce((s, m) => s + (m.total_sessions ?? 0), 0);
  const groupCount = activeGroupMemberships.length;
  const weightedWinPct = totalSessions > 0
    ? Math.round(activeGroupMemberships.reduce((s, m) => s + (m.win_pct ?? 0) * (m.total_sessions ?? 0), 0) / totalSessions)
    : null;

  // Build tournament lists
  const registeredIds = new Set((myTournamentRegs ?? []).map((r: any) => r.tournament_id));
  const organizerTournaments: any[] = [];
  const seenOrgIds = new Set<string>();
  for (const t of createdTournaments ?? []) {
    if (!registeredIds.has(t.id) && !seenOrgIds.has(t.id)) { seenOrgIds.add(t.id); organizerTournaments.push({ tournament_id: t.id, tournament: t, status: "organizer" }); }
  }
  for (const row of coOrgTournaments ?? []) {
    const t = (row as any).tournament;
    if (t && !["completed", "cancelled"].includes(t.status) && !registeredIds.has(t.id) && !seenOrgIds.has(t.id)) {
      seenOrgIds.add(t.id); organizerTournaments.push({ tournament_id: t.id, tournament: t, status: "organizer" });
    }
  }
  const allTournaments = [
    ...(myTournamentRegs ?? []).filter((r: any) => r.tournament && !["completed", "cancelled"].includes(r.tournament.status)),
    ...organizerTournaments,
  ].sort((a: any, b: any) => a.tournament.start_date.localeCompare(b.tournament.start_date));

  const activeTournaments = allTournaments.filter((r: any) => r.tournament.status === "in_progress");
  const upcomingTournaments = allTournaments.filter((r: any) => r.tournament.status !== "in_progress");

  const activeSessions = (activeParticipant ?? []).filter((p: any) => {
    const s = p.session?.status;
    return s && !["session_complete", "created"].includes(s);
  });

  const hasActive = activeSessions.length > 0 || activeTournaments.length > 0;

  // Build unified upcoming events sorted by date
  type UpcomingEvent =
    | { kind: "sheet"; date: string; id: string; group: string; location: string }
    | { kind: "tournament"; date: string; id: string; title: string; location: string; time?: string; status: string };

  const upcoming: UpcomingEvent[] = [
    ...(upcomingTournaments.map((r: any) => ({
      kind: "tournament" as const,
      date: r.tournament.start_date,
      id: r.tournament_id,
      title: r.tournament.title,
      location: r.tournament.location,
      time: r.tournament.start_time,
      status: r.status,
    }))),
    ...(activeSheets.map((s: any) => ({
      kind: "sheet" as const,
      date: s.event_date,
      id: s.id,
      group: s.group?.name ?? "Event",
      location: s.location,
    }))),
  ].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-dark-100">
          Welcome back, {profile.display_name}
        </h1>
        <p className="mt-1 text-surface-muted">Here&apos;s what&apos;s happening in Tri-Star Pickleball.</p>
      </div>

      {/* Active now */}
      {hasActive && (
        <section>
          <h2 className="text-base font-semibold text-dark-100 mb-3">Active Now</h2>
          <div className="space-y-3">
            {activeSessions.map((ap: any) => (
              <Link
                key={ap.session_id}
                href={`/sessions/${ap.session_id}`}
                className="card flex items-center justify-between bg-teal-900/30 border border-teal-500/30 hover:border-teal-500/60 transition-colors"
              >
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-teal-400">Live Session</p>
                  <p className="text-base font-bold text-dark-100">
                    {ap.session?.group?.name ?? "Shootout"}
                    {ap.court_number && <span className="font-normal text-dark-300"> — Court {ap.court_number}</span>}
                  </p>
                  <p className="text-xs text-surface-muted">{ap.session?.sheet?.location}</p>
                </div>
                <span className="flex items-center gap-1 text-sm font-medium text-teal-300">
                  Go
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                    <path fillRule="evenodd" d="M3 10a.75.75 0 0 1 .75-.75h10.638L10.23 5.29a.75.75 0 1 1 1.04-1.08l5.5 5.25a.75.75 0 0 1 0 1.08l-5.5 5.25a.75.75 0 1 1-1.04-1.08l4.158-3.96H3.75A.75.75 0 0 1 3 10Z" clipRule="evenodd" />
                  </svg>
                </span>
              </Link>
            ))}
            {activeTournaments.map((reg: any) => (
              <Link
                key={reg.tournament_id}
                href={`/tournaments/${reg.tournament_id}`}
                className="card flex items-center justify-between bg-accent-900/30 border border-accent-500/30 hover:border-accent-500/60 transition-colors"
              >
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-accent-400">Tournament In Progress</p>
                  <p className="text-base font-bold text-dark-100">{reg.tournament.title}</p>
                  <p className="text-xs text-surface-muted">{reg.tournament.location}</p>
                </div>
                <span className="flex items-center gap-1 text-sm font-medium text-accent-300">
                  Go
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                    <path fillRule="evenodd" d="M3 10a.75.75 0 0 1 .75-.75h10.638L10.23 5.29a.75.75 0 1 1 1.04-1.08l5.5 5.25a.75.75 0 0 1 0 1.08l-5.5 5.25a.75.75 0 1 1-1.04-1.08l4.158-3.96H3.75A.75.75 0 0 1 3 10Z" clipRule="evenodd" />
                  </svg>
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="card flex items-start gap-3">
          <div className="rounded-lg bg-brand-500/10 p-2 shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5 text-brand-vivid">
              <path fillRule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653z" clipRule="evenodd" />
            </svg>
          </div>
          <div>
            <p className="text-xs text-surface-muted">Sessions</p>
            <p className="text-2xl font-bold text-dark-100">{totalSessions}</p>
          </div>
        </div>
        <div className="card flex items-start gap-3">
          <div className="rounded-lg bg-green-500/10 p-2 shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5 text-green-400">
              <path fillRule="evenodd" d="M15.22 6.268a.75.75 0 01.968-.431l5.942 2.28a.75.75 0 01.431.97l-2.28 5.941a.75.75 0 11-1.4-.537l1.63-4.251-1.086.484a11.2 11.2 0 00-5.45 5.173.75.75 0 01-1.199.19L9 12.31l-6.22 6.22a.75.75 0 11-1.06-1.06l6.75-6.75a.75.75 0 011.06 0l3.606 3.605a12.694 12.694 0 015.68-4.973l1.086-.484-4.251-1.632a.75.75 0 01-.432-.968z" clipRule="evenodd" />
            </svg>
          </div>
          <div>
            <p className="text-xs text-surface-muted">Pt Win %</p>
            <p className="text-2xl font-bold text-dark-100">{weightedWinPct !== null ? `${weightedWinPct}%` : "—"}</p>
          </div>
        </div>
        <div className="card flex items-start gap-3">
          <div className="rounded-lg bg-indigo-500/10 p-2 shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5 text-indigo-400">
              <path fillRule="evenodd" d="M8.25 6.75a3.75 3.75 0 117.5 0 3.75 3.75 0 01-7.5 0zM15.75 9.75a3 3 0 116 0 3 3 0 01-6 0zM2.25 9.75a3 3 0 116 0 3 3 0 01-6 0zM6.31 15.117A6.745 6.745 0 0112 12a6.745 6.745 0 016.709 7.498.75.75 0 01-.372.568A12.696 12.696 0 0112 21.75c-2.305 0-4.47-.612-6.337-1.684a.75.75 0 01-.372-.568 6.787 6.787 0 011.019-4.38z" clipRule="evenodd" />
              <path d="M5.082 14.254a8.287 8.287 0 00-1.308 5.135 9.687 9.687 0 01-1.764-.44l-.115-.04a.563.563 0 01-.373-.487l-.01-.121a3.75 3.75 0 013.57-4.047zM20.226 19.389a8.287 8.287 0 00-1.308-5.135 3.75 3.75 0 013.57 4.047l-.01.121a.563.563 0 01-.373.486l-.115.04c-.567.2-1.156.349-1.764.441z" />
            </svg>
          </div>
          <div>
            <p className="text-xs text-surface-muted">Groups</p>
            <p className="text-2xl font-bold text-dark-100">{groupCount}</p>
          </div>
        </div>
        <Link href="/badges" className="card flex items-start gap-3 hover:ring-brand-500/30 transition-shadow">
          <div className="rounded-lg bg-amber-500/10 p-2 shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5 text-amber-400">
              <path fillRule="evenodd" d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.007 5.404.433c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.433 2.082-5.006z" clipRule="evenodd" />
            </svg>
          </div>
          <div>
            <p className="text-xs text-surface-muted">Badges</p>
            <p className="text-2xl font-bold text-dark-100">
              {badgeStats.earned}
              <span className="text-sm font-normal text-surface-muted"> / {badgeStats.total}</span>
            </p>
          </div>
        </Link>
      </div>

      {/* My Groups */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-dark-100">My Groups</h2>
          <Link href="/groups" className="text-sm text-brand-400 hover:text-brand-300">Browse all</Link>
        </div>
        {activeGroupMemberships.length > 0 ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {activeGroupMemberships.map((m) => (
              <Link
                key={m.group_id}
                href={`/groups/${(m as any).group?.slug}`}
                className="card hover:ring-brand-500/30 transition-shadow"
              >
                <h3 className="font-semibold text-dark-100">{(m as any).group?.name}</h3>
                {((m as any).group?.city || (m as any).group?.state) && (
                  <p className="text-xs text-surface-muted mb-2">
                    {[(m as any).group?.city, (m as any).group?.state].filter(Boolean).join(", ")}
                  </p>
                )}
                <div className="mt-2 grid grid-cols-3 gap-1 text-center">
                  <div>
                    <p className="text-lg font-bold text-dark-100">{m.current_step}</p>
                    <p className="text-[10px] text-surface-muted uppercase tracking-wide">Step</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-dark-100">{m.win_pct}%</p>
                    <p className="text-[10px] text-surface-muted uppercase tracking-wide">Pts</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-dark-100">{m.total_sessions}</p>
                    <p className="text-[10px] text-surface-muted uppercase tracking-wide">Sessions</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState
            inline
            icon={
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-8 w-8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
              </svg>
            }
            title="No groups yet"
            description="Find a group that matches your schedule."
            actionLabel="Browse groups"
            actionHref="/groups"
          />
        )}
      </section>

      {/* Upcoming Schedule */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-dark-100">Upcoming</h2>
          <Link href="/sheets" className="text-sm text-brand-400 hover:text-brand-300">View sheets</Link>
        </div>
        {upcoming.length > 0 ? (
          <div className="space-y-2">
            {upcoming.map((ev) =>
              ev.kind === "sheet" ? (
                <Link
                  key={`sheet-${ev.id}`}
                  href={`/sheets/${ev.id}`}
                  className="card flex items-center gap-4 hover:ring-brand-500/30 transition-shadow"
                >
                  {/* Date block */}
                  <div className="shrink-0 w-11 text-center">
                    <p className="text-[10px] font-semibold uppercase text-surface-muted leading-none">
                      {new Date(ev.date + "T12:00:00").toLocaleDateString("en-US", { month: "short" })}
                    </p>
                    <p className="text-xl font-bold text-dark-100 leading-tight">
                      {new Date(ev.date + "T12:00:00").getDate()}
                    </p>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-dark-100 truncate">{ev.group}</p>
                    <p className="text-xs text-surface-muted truncate">{ev.location}</p>
                  </div>
                  <span className="badge-green shrink-0">Open</span>
                </Link>
              ) : (
                <Link
                  key={`t-${ev.id}`}
                  href={`/tournaments/${ev.id}`}
                  className="card flex items-center gap-4 hover:ring-brand-500/30 transition-shadow"
                >
                  <div className="shrink-0 w-11 text-center">
                    <p className="text-[10px] font-semibold uppercase text-surface-muted leading-none">
                      {new Date(ev.date + "T12:00:00").toLocaleDateString("en-US", { month: "short" })}
                    </p>
                    <p className="text-xl font-bold text-dark-100 leading-tight">
                      {new Date(ev.date + "T12:00:00").getDate()}
                    </p>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-dark-100 truncate">{ev.title}</p>
                    <p className="text-xs text-surface-muted truncate">
                      {ev.time && `${formatTime(ev.time)} · `}{ev.location}
                    </p>
                  </div>
                  <span className={ev.status === "organizer" ? "badge-blue shrink-0" : ev.status === "confirmed" ? "badge-green shrink-0" : "badge-yellow shrink-0"}>
                    {ev.status === "organizer" ? "Organizer" : ev.status === "confirmed" ? "Registered" : "Waitlist"}
                  </span>
                </Link>
              )
            )}
          </div>
        ) : (
          <EmptyState
            inline
            icon={
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-8 w-8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
              </svg>
            }
            title="Nothing scheduled"
            description="Check back soon for upcoming events and tournaments."
            actionLabel="View all sheets"
            actionHref="/sheets"
          />
        )}
      </section>

      {/* Footer */}
      <footer className="pt-4 border-t border-surface-border flex items-center gap-4">
        <Link href="/privacy" className="text-xs text-surface-muted hover:text-dark-200 transition-colors">
          Privacy Policy
        </Link>
        <Link href="/terms" className="text-xs text-surface-muted hover:text-dark-200 transition-colors">
          Terms of Service
        </Link>
      </footer>
    </div>
  );
}
