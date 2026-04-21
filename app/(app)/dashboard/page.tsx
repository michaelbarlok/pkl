import {
  EmptyState,
  EmptyIllustrationGroups,
  EmptyIllustrationCalendar,
} from "@/components/empty-state";
import { createClient } from "@/lib/supabase/server";
import { getBadgeStats } from "@/lib/queries/badges";
import { groupGradient } from "@/lib/group-gradient";
import { sheetIsExpired } from "@/lib/sheet-lifecycle";
import { displaySessionsForGroup, isTestUser } from "@/lib/utils";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatTime } from "@/lib/utils";

/**
 * Authenticated home / dashboard.
 *
 * Shape:
 *  1. Contextual hero — live session, today's event, or next event CTA.
 *  2. Unified "What's next" timeline (live + upcoming) with status pills.
 *  3. Compact stats strip (dense tiles).
 *  4. Recent activity feed.
 *  5. My groups.
 */
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
    supabase.from("group_memberships").select("*, group:shootout_groups(*, group_preferences(pct_window_sessions))").eq("player_id", profile.id),
    supabase.from("signup_sheets").select("*, group:shootout_groups(name, slug, is_active)").eq("status", "open").order("event_date", { ascending: true }).limit(5),
    supabase.from("tournament_registrations").select("tournament_id, division, status, tournament:tournaments(id, title, start_date, start_time, location, status)").eq("player_id", profile.id).neq("status", "withdrawn"),
    supabase.from("tournaments").select("id, title, start_date, start_time, location, status").eq("created_by", profile.id).not("status", "in", '("completed","cancelled")'),
    supabase.from("tournament_organizers").select("tournament:tournaments(id, title, start_date, start_time, location, status)").eq("profile_id", profile.id),
    supabase.from("session_participants").select("session_id, court_number, session:shootout_sessions(id, status, num_courts, group:shootout_groups(name), sheet:signup_sheets(event_date, location))").eq("player_id", profile.id).eq("checked_in", true).limit(10),
    getBadgeStats(profile.id),
  ]);

  // Filter to active groups only
  const activeGroupMemberships = (memberships ?? []).filter((m) => (m as any).group?.is_active !== false);
  // Hide sheets whose event is 12+ hours past — matches the sheets-list rule
  // so the dashboard doesn't keep surfacing a finished event.
  const activeSheets = (sheets ?? []).filter(
    (s: any) => s.group?.is_active !== false && !sheetIsExpired(s)
  );
  const groupIds = activeGroupMemberships.map((m) => m.group_id);

  // Aggregate stats. We use the per-group DISPLAY count (capped at
  // each group's rolling-pt% window) so the dashboard stats line up
  // with what members see on each group's ranking page. Uncapped
  // lifetime sessions would still weight a group that stopped
  // affecting its % 10 sessions ago.
  const displayedSessionsByGroup = activeGroupMemberships.map((m) =>
    displaySessionsForGroup(
      m.total_sessions,
      (m as any).group?.group_preferences?.pct_window_sessions
    )
  );
  const totalSessions = displayedSessionsByGroup.reduce((s, n) => s + n, 0);
  const groupCount = activeGroupMemberships.length;
  const weightedWinPct = totalSessions > 0
    ? Math.round(
        activeGroupMemberships.reduce(
          (s, m, i) => s + (m.win_pct ?? 0) * displayedSessionsByGroup[i],
          0
        ) / totalSessions
      )
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

  // Unified timeline: live + upcoming, with explicit status keys driving
  // the pill on the right. Keeps ordering stable (live → today → future).
  type TimelineItem =
    | { kind: "live-session"; id: string; href: string; title: string; subtitle: string; status: "live" }
    | { kind: "live-tournament"; id: string; href: string; title: string; subtitle: string; status: "live" }
    | { kind: "sheet"; id: string; href: string; title: string; subtitle: string; date: string; status: "open" }
    | { kind: "tournament"; id: string; href: string; title: string; subtitle: string; date: string; status: "upcoming" | "waitlist" | "organizer" };

  const timeline: TimelineItem[] = [
    ...activeSessions.map((ap: any): TimelineItem => ({
      kind: "live-session",
      id: ap.session_id,
      href: `/sessions/${ap.session_id}`,
      title: ap.session?.group?.name ?? "Shootout",
      subtitle: ap.court_number
        ? `Court ${ap.court_number} · ${ap.session?.sheet?.location ?? ""}`
        : ap.session?.sheet?.location ?? "",
      status: "live",
    })),
    ...activeTournaments.map((r: any): TimelineItem => ({
      kind: "live-tournament",
      id: r.tournament_id,
      href: `/tournaments/${r.tournament_id}`,
      title: r.tournament.title,
      subtitle: r.tournament.location ?? "",
      status: "live",
    })),
    ...activeSheets.map((s: any): TimelineItem => ({
      kind: "sheet",
      id: s.id,
      href: `/sheets/${s.id}`,
      title: s.group?.name ?? "Event",
      subtitle: s.location,
      date: s.event_date,
      status: "open",
    })),
    ...upcomingTournaments.map((r: any): TimelineItem => ({
      kind: "tournament",
      id: r.tournament_id,
      href: `/tournaments/${r.tournament_id}`,
      title: r.tournament.title,
      subtitle: r.tournament.start_time
        ? `${formatTime(r.tournament.start_time)} · ${r.tournament.location ?? ""}`
        : r.tournament.location ?? "",
      date: r.tournament.start_date,
      status:
        r.status === "organizer" ? "organizer" :
        r.status === "confirmed" ? "upcoming" :
        "waitlist",
    })),
  ];

  // Live items stay at top in insertion order; dated items sort by date.
  const liveItems = timeline.filter((t) => t.status === "live");
  const datedItems = timeline
    .filter((t): t is Extract<TimelineItem, { date: string }> => "date" in t)
    .sort((a, b) => a.date.localeCompare(b.date));
  const orderedTimeline: TimelineItem[] = [...liveItems, ...datedItems];

  // ── Contextual hero ─────────────────────────────────────────
  // Pick one "lead" event to feature: live session first, then a tournament
  // in progress, then the very next upcoming. Everything else goes in the
  // timeline below it.
  const todayIso = new Date().toISOString().slice(0, 10);
  const lead: TimelineItem | null = orderedTimeline[0] ?? null;

  // ── Activity feed (best-effort, capped for perf) ────────────
  // We combine three signals into a single feed. Each source is tight
  // (indexed + capped to 10) so we don't pay for a big union across groups.
  let activity: Array<{
    id: string;
    when: string; // ISO
    text: React.ReactNode;
    href?: string;
  }> = [];

  if (groupIds.length > 0) {
    const [
      { data: recentSessions },
      { data: recentMatches },
      { data: recentBadges },
    ] = await Promise.all([
      supabase
        .from("shootout_sessions")
        .select("id, group_id, created_at, updated_at, group:shootout_groups(name)")
        .in("group_id", groupIds)
        .eq("status", "session_complete")
        .order("updated_at", { ascending: false })
        .limit(5),
      supabase
        .from("free_play_matches")
        .select(
          `id, group_id, played_at, score_a, score_b,
           group:shootout_groups(name),
           a1:profiles!free_play_matches_team_a_p1_fkey(display_name),
           b1:profiles!free_play_matches_team_b_p1_fkey(display_name)`
        )
        .in("group_id", groupIds)
        .order("played_at", { ascending: false })
        .limit(5),
      supabase
        .from("player_badges")
        .select(
          `id, earned_at, player:profiles!player_badges_player_id_fkey(display_name),
           badge:badge_definitions(name)`
        )
        .order("earned_at", { ascending: false })
        .limit(5),
    ]);

    activity = [
      ...((recentSessions ?? []).map((s: any) => ({
        id: `sess-${s.id}`,
        when: s.updated_at ?? s.created_at,
        href: `/sessions/${s.id}`,
        text: (
          <>
            <span className="font-medium text-dark-100">{s.group?.name ?? "Shootout"}</span>
            <span className="text-surface-muted"> · session completed</span>
          </>
        ),
      }))),
      ...((recentMatches ?? [])
        // Hide any match where the displayed winner OR the opposing
        // team lead is a [TEST] account — the Recent Activity feed is
        // visible to every member on their Dashboard and test users
        // shouldn't surface in public-facing lists.
        .filter(
          (m: any) =>
            !isTestUser(null, m.a1?.display_name) &&
            !isTestUser(null, m.b1?.display_name)
        )
        .map((m: any) => {
        const winner = m.score_a > m.score_b ? m.a1?.display_name : m.b1?.display_name;
        return {
          id: `match-${m.id}`,
          when: m.played_at,
          text: (
            <>
              <span className="font-medium text-dark-100">{winner ?? "A player"}</span>
              <span className="text-surface-muted"> won {m.score_a}–{m.score_b} in </span>
              <span className="text-dark-200">{m.group?.name ?? "free play"}</span>
            </>
          ),
        };
      })),
      ...((recentBadges ?? [])
        // Same rule — no [TEST] accounts in the public badge ticker.
        .filter((b: any) => !isTestUser(null, b.player?.display_name))
        .map((b: any) => ({
        id: `badge-${b.id}`,
        when: b.earned_at,
        text: (
          <>
            <span className="font-medium text-dark-100">{b.player?.display_name ?? "Someone"}</span>
            <span className="text-surface-muted"> earned the </span>
            <span className="text-amber-400 font-medium">{b.badge?.name ?? "a"}</span>
            <span className="text-surface-muted"> badge</span>
          </>
        ),
      }))),
    ]
      .filter((a) => !!a.when)
      .sort((a, b) => b.when.localeCompare(a.when))
      .slice(0, 5);
  }

  // A brand new user has nothing to show: no groups, no timeline, no tourneys.
  // Rather than an awkward "greeting + empty state soup" we give them a guided
  // first-run block that points at the three things they can do right now.
  const isFirstRun =
    !lead &&
    activeGroupMemberships.length === 0 &&
    allTournaments.length === 0 &&
    totalSessions === 0;

  return (
    <div className="space-y-10 sm:space-y-12 animate-fade-in">
      {/* 1 ── Contextual hero */}
      {isFirstRun ? (
        <OnboardingHero name={profile.display_name} />
      ) : lead ? (
        <ContextualHero lead={lead} />
      ) : (
        <SimpleHero name={profile.display_name} />
      )}

      {/* 2 ── Timeline */}
      {!isFirstRun && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <SectionLabel>What&apos;s next</SectionLabel>
            <Link href="/sheets" className="text-sm text-brand-400 hover:text-brand-300">View sheets</Link>
          </div>
          {orderedTimeline.length > 0 ? (
            <ul className="divide-y divide-surface-border rounded-xl bg-surface-raised ring-1 ring-surface-border overflow-hidden">
              {orderedTimeline.map((item) => (
                <TimelineRow key={`${item.kind}-${item.id}`} item={item} todayIso={todayIso} />
              ))}
            </ul>
          ) : (
            <EmptyState
              illustration={<EmptyIllustrationCalendar />}
              title="Nothing scheduled"
              description="Check back soon for upcoming events and tournaments."
              actionLabel="Browse sheets"
              actionHref="/sheets"
              secondaryLabel="See tournaments"
              secondaryHref="/tournaments"
            />
          )}
        </section>
      )}

      {/* 3 ── Compact stats strip */}
      {!isFirstRun && (
        <section>
          <SectionLabel className="mb-3">Your season</SectionLabel>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StatTile label="Sessions" value={String(totalSessions)} />
            <StatTile label="Pt win %" value={weightedWinPct !== null ? `${weightedWinPct}%` : "—"} />
            <StatTile label="Groups" value={String(groupCount)} />
            <StatTile
              label="Badges"
              value={`${badgeStats.earned}`}
              suffix={`/${badgeStats.total}`}
              href="/badges"
            />
          </div>
        </section>
      )}

      {/* 4 ── Recent activity */}
      {activity.length > 0 && (
        <section>
          <SectionLabel className="mb-3">Recent activity</SectionLabel>
          <ul className="space-y-1.5">
            {activity.map((a) => (
              <li key={a.id} className="flex items-baseline gap-3 text-sm">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-surface-muted w-10 shrink-0">
                  {relativeShort(a.when)}
                </span>
                <span className="flex-1 min-w-0 truncate">
                  {a.href ? (
                    <Link href={a.href} className="hover:text-brand-300 transition-colors">
                      {a.text}
                    </Link>
                  ) : (
                    a.text
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 5 ── My Groups */}
      {!isFirstRun && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <SectionLabel>My groups</SectionLabel>
            <Link href="/groups" className="text-sm text-brand-400 hover:text-brand-300">Browse all</Link>
          </div>
          {activeGroupMemberships.length > 0 ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {activeGroupMemberships.map((m) => {
              const g = (m as any).group;
              const gradient = groupGradient(g?.slug ?? g?.id ?? "");
              return (
                <Link
                  key={m.group_id}
                  href={`/groups/${g?.slug}`}
                  className="group relative rounded-xl bg-surface-raised ring-1 ring-surface-border overflow-hidden transition-all hover:ring-brand-500/40 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-black/25"
                >
                  {/* Tiny color strip that matches the group's gradient */}
                  <div className={`h-1.5 ${gradient}`} />
                  <div className="p-4">
                    <h3 className="font-semibold text-dark-100">{g?.name}</h3>
                    {(g?.city || g?.state) && (
                      <p className="text-xs text-surface-muted mb-2">
                        {[g?.city, g?.state].filter(Boolean).join(", ")}
                      </p>
                    )}
                    <div className="mt-2 grid grid-cols-3 gap-1 text-center">
                      <GroupMiniStat label="Step" value={String(m.current_step)} />
                      <GroupMiniStat label="Pts" value={`${m.win_pct}%`} />
                      <GroupMiniStat
                        label="Sessions"
                        value={String(
                          displaySessionsForGroup(
                            m.total_sessions,
                            g?.group_preferences?.pct_window_sessions
                          )
                        )}
                      />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
          ) : (
            <EmptyState
              illustration={<EmptyIllustrationGroups />}
              title="No groups yet"
              description="Find a ladder league or free play group that fits your schedule."
              actionLabel="Browse groups"
              actionHref="/groups"
            />
          )}
        </section>
      )}

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

// ─────────────────────────────────────────────────────────────
// Sub-components (server-side only; no client JS)
// ─────────────────────────────────────────────────────────────

function ContextualHero({ lead }: { lead: any }) {
  const isLive = lead.status === "live";
  const tint = isLive
    ? "from-teal-600/40 via-brand-600/30 to-surface-raised"
    : "from-brand-600/30 via-brand-700/20 to-surface-raised";
  const eyebrow = isLive
    ? "You're live right now"
    : lead.kind === "sheet"
      ? "Next up"
      : "Next tournament";
  const cta = isLive ? "Jump to court →" : lead.kind === "sheet" ? "View sheet →" : "View tournament →";
  const bigDate = "date" in lead && lead.date
    ? formatDateChip(lead.date)
    : null;

  return (
    <Link
      href={lead.href}
      className={`group relative block rounded-2xl p-6 sm:p-7 bg-gradient-to-br ${tint} ring-1 ring-surface-border overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-xl hover:shadow-black/30`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-vivid">
            {eyebrow}
          </p>
          <h1 className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight text-dark-100 break-words">
            {lead.title}
          </h1>
          <p className="mt-1 text-sm sm:text-base text-surface-muted">
            {lead.subtitle}
          </p>
          <p className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-vivid group-hover:text-brand-300">
            {cta}
          </p>
        </div>
        {bigDate && (
          <div className="shrink-0 text-right">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-surface-muted leading-none">
              {bigDate.month}
            </p>
            <p className="text-4xl sm:text-5xl font-bold leading-none mt-1 text-dark-100">
              {bigDate.day}
            </p>
          </div>
        )}
        {isLive && !bigDate && (
          <span className="status-live self-start whitespace-nowrap animate-pulse">
            Live
          </span>
        )}
      </div>
    </Link>
  );
}

function SimpleHero({ name }: { name: string }) {
  const hour = new Date().getHours();
  const greeting =
    hour < 5 ? "Good night" :
    hour < 12 ? "Good morning" :
    hour < 18 ? "Good afternoon" :
    "Good evening";
  return (
    <div>
      <h1 className="text-heading">{greeting}, {name}</h1>
      <p className="mt-1 text-surface-muted">Nothing urgent — here&apos;s what&apos;s on the horizon.</p>
    </div>
  );
}

/** First-run welcome block: three numbered steps + a primary CTA. Shown only
 *  to users with no groups, no registrations, and no session history. */
function OnboardingHero({ name }: { name: string }) {
  const steps = [
    {
      n: 1,
      title: "Join a group",
      body: "Find a ladder league or free-play group that fits your schedule and request to join.",
    },
    {
      n: 2,
      title: "Sign up for a session",
      body: "Once you're in, tap into any open sign-up sheet and grab a spot.",
    },
    {
      n: 3,
      title: "Show up and play",
      body: "Courts, scores, and rankings update as you play — no spreadsheets required.",
    },
  ];
  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-700/40 via-brand-600/25 to-surface-raised ring-1 ring-surface-border">
      <div className="p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-vivid">
          Welcome
        </p>
        <h1 className="mt-1 text-2xl sm:text-3xl font-bold tracking-tight text-dark-100">
          Hey {name} — let&apos;s get you playing.
        </h1>
        <p className="mt-2 max-w-xl text-sm sm:text-base text-surface-muted">
          Three quick steps. You can come back to this anytime — your dashboard
          will fill in with live events and stats as soon as you join a group.
        </p>

        <ol className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {steps.map((s) => (
            <li
              key={s.n}
              className="rounded-xl bg-dark-950/30 ring-1 ring-surface-border p-4"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-900/60 text-brand-300 font-bold">
                {s.n}
              </div>
              <p className="mt-3 text-sm font-semibold text-dark-100">{s.title}</p>
              <p className="mt-1 text-xs text-surface-muted leading-relaxed">{s.body}</p>
            </li>
          ))}
        </ol>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Link href="/groups" className="btn-primary">
            Browse groups
          </Link>
          <Link href="/tournaments" className="text-sm font-medium text-brand-400 hover:text-brand-300">
            Or check tournaments →
          </Link>
        </div>
      </div>
    </div>
  );
}

function TimelineRow({ item, todayIso }: { item: any; todayIso: string }) {
  const isLive = item.status === "live";
  const statusClass =
    item.status === "live" ? "status-live"
    : item.status === "open" ? "status-open"
    : item.status === "upcoming" ? "status-upcoming"
    : item.status === "waitlist" ? "badge-yellow"
    : item.status === "organizer" ? "badge-blue"
    : "status-closed";
  const statusLabel =
    item.status === "live" ? "Live"
    : item.status === "open" ? "Open"
    : item.status === "upcoming" ? "Registered"
    : item.status === "waitlist" ? "Waitlist"
    : item.status === "organizer" ? "Organizer"
    : "";

  const chip = "date" in item && item.date
    ? formatDateChip(item.date, item.date === todayIso)
    : null;

  return (
    <li>
      <Link
        href={item.href}
        className="flex items-center gap-4 px-4 py-3.5 hover:bg-surface-overlay/60 transition-colors"
      >
        {chip ? (
          <div className="shrink-0 w-11 text-center">
            <p className="text-[10px] font-semibold uppercase text-surface-muted leading-none">
              {chip.month}
            </p>
            <p className="text-xl font-bold text-dark-100 leading-tight">
              {chip.day}
            </p>
          </div>
        ) : (
          <div className="shrink-0 h-10 w-10 rounded-full bg-teal-500/15 flex items-center justify-center">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-60 animate-ping" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-teal-400" />
            </span>
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="font-medium text-dark-100 truncate">{item.title}</p>
          <p className="text-xs text-surface-muted truncate">{item.subtitle}</p>
        </div>
        <span className={`${statusClass} shrink-0`}>
          {isLive ? <span className="animate-pulse">{statusLabel}</span> : statusLabel}
        </span>
      </Link>
    </li>
  );
}

function StatTile({
  label,
  value,
  suffix,
  href,
}: {
  label: string;
  value: string;
  suffix?: string;
  href?: string;
}) {
  const inner = (
    <div className="rounded-lg bg-surface-raised ring-1 ring-surface-border px-3 py-2.5 transition-all hover:ring-brand-500/30">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-surface-muted">
        {label}
      </p>
      <p className="mt-0.5 text-lg font-bold text-dark-100">
        {value}
        {suffix && <span className="text-xs font-normal text-surface-muted ml-0.5">{suffix}</span>}
      </p>
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

function GroupMiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-lg font-bold text-dark-100">{value}</p>
      <p className="text-[10px] text-surface-muted uppercase tracking-wide">{label}</p>
    </div>
  );
}

function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <h2 className={`text-xs font-semibold uppercase tracking-[0.08em] text-surface-muted ${className ?? ""}`}>
      {children}
    </h2>
  );
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

/** Tiny "5m / 2h / 3d" stamp for the activity feed. */
function relativeShort(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  if (diffMs < 0) return "now";
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "now";
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const d = Math.floor(hr / 24);
  if (d < 7) return `${d}d`;
  const w = Math.floor(d / 7);
  return `${w}w`;
}

/** Split a YYYY-MM-DD (or full ISO) into a compact month/day chip. "TODAY"
 *  overrides the month slot when the supplied date is today's ISO. */
function formatDateChip(iso: string, isToday = false): { month: string; day: string } {
  const dateOnly = iso.length === 10 ? iso + "T12:00:00" : iso;
  const d = new Date(dateOnly);
  return {
    month: isToday ? "TDY" : d.toLocaleDateString("en-US", { month: "short" }).toUpperCase(),
    day: String(d.getDate()),
  };
}
