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
    supabase.from("signup_sheets").select("*, group:shootout_groups(name, slug)").eq("status", "open").order("event_date", { ascending: true }).limit(5),
    supabase.from("tournament_registrations").select("tournament_id, division, status, tournament:tournaments(id, title, start_date, start_time, location, status)").eq("player_id", profile.id).neq("status", "withdrawn"),
    supabase.from("tournaments").select("id, title, start_date, start_time, location, status").eq("created_by", profile.id).not("status", "in", '("completed","cancelled")'),
    supabase.from("tournament_organizers").select("tournament:tournaments(id, title, start_date, start_time, location, status)").eq("profile_id", profile.id),
    supabase.from("session_participants").select("session_id, court_number, session:shootout_sessions(id, status, num_courts, group:shootout_groups(name), sheet:signup_sheets(event_date, location))").eq("player_id", profile.id).eq("checked_in", true).limit(10),
    getBadgeStats(profile.id),
  ]);

  // Aggregate stats
  const totalSessions = (memberships ?? []).reduce((s, m) => s + (m.total_sessions ?? 0), 0);
  const groupCount = (memberships ?? []).length;
  const weightedWinPct = totalSessions > 0
    ? Math.round((memberships ?? []).reduce((s, m) => s + (m.win_pct ?? 0) * (m.total_sessions ?? 0), 0) / totalSessions)
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
    ...((sheets ?? []).map((s: any) => ({
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
          <h2 className="text-sm font-semibold uppercase tracking-wider text-surface-muted mb-3">Active Now</h2>
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
        <div className="card">
          <p className="text-xs text-surface-muted">Sessions</p>
          <p className="mt-1 text-2xl font-bold text-dark-100">{totalSessions}</p>
        </div>
        <div className="card">
          <p className="text-xs text-surface-muted">Pt Win %</p>
          <p className="mt-1 text-2xl font-bold text-dark-100">
            {weightedWinPct !== null ? `${weightedWinPct}%` : "—"}
          </p>
        </div>
        <div className="card">
          <p className="text-xs text-surface-muted">Groups</p>
          <p className="mt-1 text-2xl font-bold text-dark-100">{groupCount}</p>
        </div>
        <Link href="/badges" className="card hover:ring-brand-500/30 transition-shadow">
          <p className="text-xs text-surface-muted">Badges</p>
          <p className="mt-1 text-2xl font-bold text-dark-100">
            {badgeStats.earned}
            <span className="text-sm font-normal text-surface-muted"> / {badgeStats.total}</span>
          </p>
        </Link>
      </div>

      {/* My Groups */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-surface-muted">My Groups</h2>
          <Link href="/groups" className="text-sm text-brand-400 hover:text-brand-300">Browse all</Link>
        </div>
        {memberships && memberships.length > 0 ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {memberships.map((m) => (
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
          <h2 className="text-sm font-semibold uppercase tracking-wider text-surface-muted">Upcoming</h2>
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
