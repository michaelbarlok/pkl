import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { formatDateInZone, formatTimeInZone, PRIORITY_ORDER } from "@/lib/utils";
import {
  sheetIsExpired,
  sheetSignupClosed,
  sheetWithdrawClosed,
} from "@/lib/sheet-lifecycle";
import type { Registration, Profile } from "@/types/database";
import { SheetActions } from "./sheet-actions";
import { AdminAddMember } from "./admin-add-member";
import { AdminDeleteSheet } from "./admin-delete-sheet";
import { AdminRemovePlayer } from "./admin-remove-player";
import { StartShootout } from "./start-shootout";
import { ShareButton } from "./share-button";
import { Breadcrumb } from "@/components/breadcrumb";
import { ContactOrganizersButton } from "@/components/contact-organizers-button";
import { PlayerAvatar } from "@/components/player-avatar";
import { computeCourtPreview, CourtPreviewSection } from "./court-preview";
import { LiveRosterCount } from "./live-roster-count";

export const dynamic = "force-dynamic";

export default async function SheetDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", user.id)
    .single();
  if (!profile) notFound();

  const { data: sheet, error } = await supabase
    .from("signup_sheets")
    .select("*, group:shootout_groups(*)")
    .eq("id", id)
    .single();

  if (error || !sheet) notFound();

  // Registrations — with a fallback when the join errors out under RLS.
  let registrations: (Registration & { player?: Profile })[] | null = null;
  {
    const { data, error: regError } = await supabase
      .from("registrations")
      .select("*, player:profiles!registrations_player_id_fkey(*)")
      .eq("sheet_id", id)
      .in("status", ["confirmed", "waitlist"])
      .order("signed_up_at", { ascending: true });

    if (regError) {
      console.error("Registration join query failed:", regError.message);
      const { data: plainRegs } = await supabase
        .from("registrations")
        .select("*")
        .eq("sheet_id", id)
        .in("status", ["confirmed", "waitlist"])
        .order("signed_up_at", { ascending: true });

      if (plainRegs && plainRegs.length > 0) {
        const playerIds = plainRegs.map((r) => r.player_id);
        const { data: players } = await supabase
          .from("profiles")
          .select("*")
          .in("id", playerIds);
        const playerMap = new Map((players ?? []).map((p) => [p.id, p]));
        registrations = plainRegs.map((r) => ({
          ...r,
          player: playerMap.get(r.player_id) ?? undefined,
        }));
      } else {
        registrations = [];
      }
    } else {
      registrations = data;
    }
  }

  const confirmed = (registrations ?? [])
    .filter((r: Registration) => r.status === "confirmed")
    .sort((a, b) => {
      const aPri = PRIORITY_ORDER[a.priority ?? "normal"] ?? 1;
      const bPri = PRIORITY_ORDER[b.priority ?? "normal"] ?? 1;
      if (aPri !== bPri) return aPri - bPri;
      return new Date(a.signed_up_at).getTime() - new Date(b.signed_up_at).getTime();
    });
  const waitlisted = (registrations ?? [])
    .filter((r: Registration) => r.status === "waitlist")
    .sort((a, b) => {
      const aPri = PRIORITY_ORDER[a.priority ?? "normal"] ?? 1;
      const bPri = PRIORITY_ORDER[b.priority ?? "normal"] ?? 1;
      if (aPri !== bPri) return aPri - bPri;
      return (a.waitlist_position ?? 999) - (b.waitlist_position ?? 999);
    });

  const myRegistration = (registrations ?? []).find(
    (r: Registration) => r.player_id === profile.id
  );

  const now = new Date();
  const signupClosedAt = new Date(sheet.signup_closes_at);
  const eventAt = new Date(sheet.event_time);
  const signupClosed = sheetSignupClosed(sheet, now);
  const withdrawClosed = sheetWithdrawClosed(sheet, now);
  const isCancelled = sheet.status === "cancelled";
  const isFull = confirmed.length >= sheet.player_limit;
  const isAdmin = profile.role === "admin";

  // Group admins see the same "all courts" preview that platform admins do —
  // they're the ones actually running the shootout. Only costs one tiny query.
  let isGroupAdmin = false;
  if (sheet.group_id) {
    const { data: membership } = await supabase
      .from("group_memberships")
      .select("group_role")
      .eq("group_id", sheet.group_id)
      .eq("player_id", profile.id)
      .maybeSingle();
    isGroupAdmin = membership?.group_role === "admin";
  }
  const hasAdminView = isAdmin || isGroupAdmin;

  // Once the event is 12+ hours past its start time, regular players can't
  // reach the sheet anymore — the list already hides it, but we also need
  // to block direct-link access. Admins keep access for post-event review
  // and cleanup.
  if (sheetIsExpired(sheet, now) && !hasAdminView) notFound();

  const myWaitlistPosition = myRegistration?.status === "waitlist"
    ? waitlisted.findIndex((r: Registration) => r.player_id === profile.id) + 1
    : null;

  // Active session (for court assignment lookup in the roster).
  const { data: activeSessions } = await supabase
    .from("shootout_sessions")
    .select("id, status")
    .eq("sheet_id", id)
    .neq("status", "session_complete")
    .limit(1);
  const activeSession = activeSessions?.[0] ?? null;

  let courtByPlayer = new Map<string, number>();
  if (activeSession) {
    const { data: participants } = await supabase
      .from("session_participants")
      .select("player_id, court_number")
      .eq("session_id", activeSession.id);
    for (const p of participants ?? []) {
      if (p.court_number) courtByPlayer.set(p.player_id, p.court_number);
    }
  }

  // Court preview — only meaningful for ladder groups before a session starts.
  // Viewer has to be an admin or confirmed on the sheet to see it at all.
  const isLadderGroup = (sheet as any).group?.group_type === "ladder_league";
  const viewerIsConfirmed = myRegistration?.status === "confirmed";
  const shouldShowPreview =
    isLadderGroup &&
    !isCancelled &&
    !activeSession &&
    confirmed.length >= 4 &&
    (hasAdminView || viewerIsConfirmed);

  let preview: ReturnType<typeof computeCourtPreview> = null;
  if (shouldShowPreview && sheet.group_id) {
    // Pull each confirmed player's ladder stats from the same group so the
    // preview uses the exact sort keys seedSession1 uses at start-time.
    const confirmedIds = confirmed.map((r) => r.player_id);
    const { data: memberships } = await supabase
      .from("group_memberships")
      .select("player_id, current_step, win_pct, total_sessions, last_played_at")
      .eq("group_id", sheet.group_id)
      .in("player_id", confirmedIds);
    preview = computeCourtPreview(
      confirmed.map((r) => ({
        player_id: r.player_id,
        player: r.player
          ? {
              id: r.player.id,
              display_name: r.player.display_name,
              avatar_url: r.player.avatar_url,
            }
          : undefined,
      })),
      memberships ?? []
    );
  }

  // Add-member eligibility: admins always; regular members only when the
  // group has allow_member_guests set AND signup is still open.
  const canAddMembers = isAdmin || (sheet.allow_member_guests && !signupClosed);
  const registeredPlayerIds = new Set(
    (registrations ?? []).map((r: Registration) => r.player_id)
  );
  let availableMembers: { id: string; display_name: string }[] = [];
  if (canAddMembers && !isCancelled && sheet.group_id) {
    const { data: memberships } = await supabase
      .from("group_memberships")
      .select("player_id")
      .eq("group_id", sheet.group_id);

    const memberIds = (memberships ?? [])
      .map((m) => m.player_id)
      .filter((pid) => !registeredPlayerIds.has(pid));

    if (memberIds.length > 0) {
      const { data: memberProfiles } = await supabase
        .from("profiles")
        .select("id, display_name")
        .in("id", memberIds)
        .eq("is_active", true)
        .order("display_name", { ascending: true });

      availableMembers = memberProfiles ?? [];
    }
  }

  const tz = sheet.timezone ?? "America/New_York";
  const eventDateLine = formatDateInZone(sheet.event_time, tz);
  const eventTimeLine = formatTimeInZone(sheet.event_time, tz);
  const signupCloseLine = `${formatDateInZone(sheet.signup_closes_at, tz)}, ${formatTimeInZone(sheet.signup_closes_at, tz)}`;

  // Countdown copy: "closes in 3d 4h" / "closing soon" / "closed"
  const countdownText = (() => {
    if (isCancelled) return null;
    if (signupClosed) {
      if (eventAt > now) return `Event in ${shortDuration(eventAt.getTime() - now.getTime())}`;
      return null;
    }
    return `Signup closes in ${shortDuration(signupClosedAt.getTime() - now.getTime())}`;
  })();

  const dateChip = formatDateChip(sheet.event_time, tz);
  const statusPill =
    sheet.status === "cancelled" ? { label: "Cancelled", cls: "status-cancelled" }
    : sheet.status === "closed" ? { label: "Closed", cls: "status-closed" }
    : isFull ? { label: "Waitlist only", cls: "status-upcoming" }
    : { label: "Open", cls: "status-open" };

  return (
    <div className="space-y-6 sm:space-y-8">
      <Breadcrumb items={[
        { label: "Sheets", href: "/sheets" },
        { label: sheet.group?.name ?? "Event" },
      ]} />

      {/* ── Event hero ─────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-600/25 via-brand-700/15 to-surface-raised ring-1 ring-surface-border">
        <div className="p-5 sm:p-7 flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-7">
          {/* Big date chip */}
          <div className="flex items-center gap-4 sm:gap-5 shrink-0">
            <div className="text-center leading-none">
              <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-brand-vivid">
                {dateChip.month}
              </p>
              <p className="mt-1.5 text-5xl sm:text-6xl font-bold text-dark-100">
                {dateChip.day}
              </p>
              <p className="mt-1 text-[11px] font-medium uppercase tracking-wide text-surface-muted">
                {dateChip.weekday}
              </p>
            </div>
          </div>

          {/* Title + details */}
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <h1 className="text-2xl sm:text-3xl font-bold text-dark-100 break-words">
                {sheet.group?.name ?? "Event"}
              </h1>
              <span className={`${statusPill.cls} shrink-0`}>{statusPill.label}</span>
            </div>
            <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-3 text-sm">
              <HeroField label="Time" value={eventTimeLine} />
              <HeroField label="Location" value={sheet.location} />
              <LiveRosterCount
                sheetId={sheet.id}
                initialConfirmed={confirmed.length}
                initialWaitlist={waitlisted.length}
                playerLimit={sheet.player_limit}
              />
            </dl>
            {countdownText && (
              <p className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-vivid">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z" />
                </svg>
                {countdownText}
              </p>
            )}
          </div>
        </div>

        {/* Secondary action row within the hero */}
        <div className="px-5 sm:px-7 pb-4 flex flex-wrap items-center gap-2 text-xs">
          <ShareButton title={`${sheet.group?.name ?? "Event"} · ${eventDateLine}`} />
          {!isAdmin && !isCancelled && (
            <ContactOrganizersButton
              endpoint={`/api/groups/${sheet.group_id}/contact-admins`}
              label="Contact admins"
            />
          )}
          {sheet.group?.slug && (
            <Link
              href={`/groups/${sheet.group.slug}`}
              className="btn-secondary btn-sm"
            >
              About group
            </Link>
          )}
        </div>
      </div>

      {isCancelled && (
        <div className="alert-danger p-4">This event has been cancelled.</div>
      )}

      {/* ── Primary action card ────────────────────────────────── */}
      {!isCancelled && (
        <SheetActions
          sheetId={sheet.id}
          profileId={profile.id}
          myRegistration={
            myRegistration
              ? { id: myRegistration.id, status: myRegistration.status }
              : null
          }
          signupClosed={signupClosed}
          withdrawClosed={withdrawClosed}
          isFull={isFull}
        />
      )}

      {myWaitlistPosition && (
        <div className="alert-warning px-4 py-3 text-sm">
          You&apos;re <strong>#{myWaitlistPosition}</strong> on the waitlist — we&apos;ll notify you if a spot opens.
        </div>
      )}

      {/* ── Event details (smaller, under the fold) ────────────── */}
      <details className="rounded-xl bg-surface-raised ring-1 ring-surface-border">
        <summary className="cursor-pointer list-none px-4 py-3 flex items-center justify-between">
          <span className="text-sm font-semibold text-dark-100">Event details</span>
          <svg className="h-4 w-4 text-surface-muted transition-transform group-open:rotate-180" fill="currentColor" viewBox="0 0 20 20" aria-hidden>
            <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
          </svg>
        </summary>
        <div className="border-t border-surface-border px-4 py-4 grid grid-cols-1 sm:grid-cols-2 gap-y-3 gap-x-6 text-sm">
          <DetailRow label="Sign-up closes" value={signupCloseLine} />
          {sheet.withdraw_closes_at && (
            <DetailRow
              label="Withdraw deadline"
              value={`${formatDateInZone(sheet.withdraw_closes_at, tz)}, ${formatTimeInZone(sheet.withdraw_closes_at, tz)}`}
            />
          )}
          <DetailRow label="Group" value={sheet.group?.name ?? "—"} />
          <DetailRow label="Location" value={sheet.location} />
        </div>
        {sheet.notes && (
          <div className="border-t border-surface-border px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-surface-muted">Notes</p>
            <p className="mt-1 text-sm text-dark-200 whitespace-pre-wrap">{sheet.notes}</p>
          </div>
        )}
      </details>

      {/* ── Admin toolbox ──────────────────────────────────────── */}
      {isAdmin && !isCancelled && (
        <div className="rounded-xl bg-surface-raised ring-1 ring-dashed ring-surface-border p-4 space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-surface-muted">
            Admin actions
          </h3>
          <div className="flex flex-wrap gap-2">
            {(sheet.status === "open" || sheet.status === "closed") &&
              (sheet as any).group?.group_type !== "free_play" && (
                <StartShootout
                  sheetId={sheet.id}
                  groupId={sheet.group_id}
                  confirmedPlayerIds={confirmed.map((r: Registration) => r.player_id)}
                  activeSession={activeSession}
                />
              )}
            <AdminDeleteSheet sheetId={sheet.id} />
          </div>
        </div>
      )}

      {canAddMembers && !isCancelled && (
        <AdminAddMember sheetId={sheet.id} members={availableMembers} />
      )}

      {/* ── Confirmed panel ────────────────────────────────────── */}
      <section className="rounded-xl bg-surface-raised ring-1 ring-surface-border">
        <header className="flex items-center justify-between px-4 py-3 border-b border-surface-border">
          <h2 className="text-sm font-semibold text-dark-100">
            Confirmed
            <span className="ml-2 text-surface-muted font-normal">
              {confirmed.length}/{sheet.player_limit}
            </span>
          </h2>
          {activeSession && (
            <span className="badge-blue">Shootout in progress</span>
          )}
        </header>
        {confirmed.length > 0 ? (
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-2 gap-y-0.5 p-2">
            {confirmed.map((reg: Registration & { player?: Profile }) => (
              <RosterCard
                key={reg.id}
                reg={reg}
                court={courtByPlayer.get(reg.player_id)}
                isMe={reg.player_id === profile.id}
                adminCanRemove={isAdmin && !isCancelled}
              />
            ))}
          </ul>
        ) : (
          <p className="px-4 py-8 text-center text-sm text-surface-muted">
            No players signed up yet — be the first!
          </p>
        )}
      </section>

      {/* ── Waitlist panel ─────────────────────────────────────── */}
      {waitlisted.length > 0 && (
        <section className="rounded-xl bg-surface-raised ring-1 ring-surface-border">
          <header className="flex items-center justify-between px-4 py-3 border-b border-surface-border">
            <h2 className="text-sm font-semibold text-dark-100">
              Waitlist
              <span className="ml-2 text-surface-muted font-normal">
                {waitlisted.length}
              </span>
            </h2>
            <span className="text-xs text-surface-muted">
              Promoted in order if spots open
            </span>
          </header>
          <ul className="divide-y divide-surface-border">
            {waitlisted.map((reg: Registration & { player?: Profile }, idx: number) => (
              <li
                key={reg.id}
                className={`flex items-center gap-3 px-4 py-2.5 ${
                  reg.player_id === profile.id ? "bg-brand-500/5" : ""
                }`}
              >
                <span className="text-xs font-semibold text-surface-muted w-6 text-right shrink-0">
                  #{idx + 1}
                </span>
                <PlayerAvatar
                  displayName={reg.player?.display_name ?? "?"}
                  avatarUrl={reg.player?.avatar_url ?? null}
                  size="sm"
                />
                <span className="flex-1 truncate text-sm text-dark-100">
                  {reg.player?.display_name ?? "Unknown"}
                </span>
                {isAdmin && !isCancelled && (
                  <AdminRemovePlayer
                    registrationId={reg.id}
                    playerName={reg.player?.display_name ?? "this player"}
                  />
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Court preview (pre-session only) ───────────────────── */}
      {preview && (
        <CourtPreviewSection
          courts={preview.courts}
          numCourts={preview.numCourts}
          viewerPlayerId={profile.id}
          viewMode={hasAdminView ? "all" : "own"}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────

function RosterCard({
  reg,
  court,
  isMe,
  adminCanRemove,
}: {
  reg: Registration & { player?: Profile };
  court: number | undefined;
  isMe: boolean;
  adminCanRemove: boolean;
}) {
  return (
    <li
      className={`flex items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-surface-overlay/50 ${
        isMe ? "bg-brand-500/5 ring-1 ring-brand-500/30" : ""
      }`}
    >
      <PlayerAvatar
        displayName={reg.player?.display_name ?? "?"}
        avatarUrl={reg.player?.avatar_url ?? null}
        size="md"
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-dark-100 truncate">
          {reg.player?.display_name ?? "Unknown"}
          {isMe && <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wide text-brand-vivid">You</span>}
        </p>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-surface-muted">
          {reg.player?.skill_level && (
            <span>{reg.player.skill_level}</span>
          )}
          {reg.priority === "high" && (
            <span className="text-accent-400 font-medium">Priority</span>
          )}
          {reg.priority === "low" && (
            <span className="text-surface-muted">Low priority</span>
          )}
        </div>
      </div>
      {court && (
        <span className="badge-blue shrink-0" title="Court assignment">
          Court {court}
        </span>
      )}
      {adminCanRemove && (
        <AdminRemovePlayer
          registrationId={reg.id}
          playerName={reg.player?.display_name ?? "this player"}
        />
      )}
    </li>
  );
}

function HeroField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-surface-muted">
        {label}
      </dt>
      <dd className="mt-0.5 text-dark-100 truncate">{value}</dd>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-surface-muted">{label}</p>
      <p className="mt-0.5 text-dark-100">{value}</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

/** "3d 4h", "2h 15m", "15m", "Now" — used in the countdown pill. */
function shortDuration(ms: number): string {
  if (ms <= 0) return "now";
  const totalMin = Math.floor(ms / 60000);
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/** Format an event timestamp into a tight "APR / 22 / Fri" chip keyed
 *  to the sheet's timezone so it matches what the user expects. */
function formatDateChip(iso: string, tz: string): {
  month: string;
  day: string;
  weekday: string;
} {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    month: "short",
    day: "numeric",
    weekday: "short",
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return {
    month: get("month").toUpperCase(),
    day: get("day"),
    weekday: get("weekday").toUpperCase(),
  };
}
