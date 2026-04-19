import { EmptyState } from "@/components/empty-state";
import { getTournament, getTournamentRegistrations, getTournamentMatches, getMyRegistration } from "@/lib/queries/tournament";
import { createClient } from "@/lib/supabase/server";
import { TournamentRegistrationButton } from "@/components/tournament-registration";
import { TournamentBracketView } from "@/components/tournament-bracket";
import type { PartnerMap } from "@/components/tournament-bracket";
import { TournamentRealtimeSubscription } from "@/components/tournament-realtime";
import { DivisionReview } from "@/components/division-review";
import { DeleteTournamentButton } from "@/components/delete-tournament-button";
import { CoOrganizerManager } from "@/components/co-organizer-manager";
import { getDivisionLabel } from "@/lib/divisions";
import { DivisionBrackets } from "./division-brackets";
import { ContactOrganizersButton } from "@/components/contact-organizers-button";
import { Breadcrumb } from "@/components/breadcrumb";
import { formatDate, formatTime, formatDateTime } from "@/lib/utils";
import { PaidToggle } from "@/components/paid-toggle";
import { PaymentReminderButton } from "@/components/payment-reminder-button";
import { ShareBracketButton } from "@/components/share-bracket-button";
import Link from "next/link";
import { notFound } from "next/navigation";

const FORMAT_LABELS: Record<string, string> = {
  single_elimination: "Single Elimination",
  double_elimination: "Double Elimination",
  round_robin: "Round Robin",
};

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-surface-overlay text-dark-200",
  registration_open: "bg-teal-900/30 text-teal-vivid",
  registration_closed: "bg-brand-900/40 text-brand-vivid",
  in_progress: "bg-accent-900/40 text-accent-300",
  completed: "bg-surface-overlay text-dark-200",
  cancelled: "bg-red-900/30 text-adaptive-red",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  registration_open: "Registration Open",
  registration_closed: "Registration Closed",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

/**
 * Tournament hero uses a deterministic gradient keyed on the tournament id
 * so each tournament wears a consistent "color" across the app (brackets,
 * detail, cards). Stays inside the brand palette.
 */
function tournamentHeroGradient(seed: string): string {
  const palette = [
    "from-brand-700/50 via-brand-600/30 to-surface-raised",
    "from-accent-700/40 via-brand-600/25 to-surface-raised",
    "from-teal-700/40 via-brand-600/25 to-surface-raised",
    "from-indigo-700/40 via-violet-600/25 to-surface-raised",
    "from-rose-700/35 via-accent-600/25 to-surface-raised",
  ];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return palette[Math.abs(h) % palette.length];
}

/** Split an ISO/date into month/day chip pieces for the hero. */
function tournamentDateChip(startIso: string, endIso: string | null) {
  const d = new Date((startIso.length === 10 ? startIso : startIso.slice(0, 10)) + "T12:00:00");
  const month = d.toLocaleDateString("en-US", { month: "short" }).toUpperCase();
  const day = String(d.getDate());
  // If the tournament spans multiple days, include the trailing day in a
  // subtle second line.
  let endDay: string | null = null;
  if (endIso && endIso !== startIso) {
    const e = new Date((endIso.length === 10 ? endIso : endIso.slice(0, 10)) + "T12:00:00");
    endDay = `–${e.getDate()}`;
  }
  return { month, day, endDay };
}

export default async function TournamentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Create a single supabase client for the page-level queries so it can be
  // reused for the organizers fetch without an extra createClient() call.
  const supabase = await createClient();

  const [tournament, registrations, matches, myRegistration, organizersResult, { data: { user } }] =
    await Promise.all([
      getTournament(id),
      getTournamentRegistrations(id),
      getTournamentMatches(id),
      getMyRegistration(id),
      supabase
        .from("tournament_organizers")
        .select("profile_id, added_at, profile:profiles!profile_id(id, display_name)")
        .eq("tournament_id", id),
      supabase.auth.getUser(),
    ]);

  if (!tournament) notFound();

  const { data: profile } = user
    ? await supabase.from("profiles").select("id, role").eq("user_id", user.id).single()
    : { data: null };
  const isCreator = profile?.id === tournament.created_by;
  const isAdmin = profile?.role === "admin";

  const coOrganizers = (organizersResult.data ?? []) as any[];
  const isCoOrganizer = profile ? coOrganizers.some((o: any) => o.profile_id === profile.id) : false;
  const canManage = isCreator || isAdmin || isCoOrganizer;

  // Hidden tournaments are invisible to non-managers
  if ((tournament as any).is_hidden && !canManage) notFound();

  const myDivision = (myRegistration as any)?.division as string | undefined;
  const isInProgress = tournament.status === "in_progress" || tournament.status === "completed";

  const confirmedRegistrations = registrations.filter((r) => r.status === "confirmed");
  const waitlistRegistrations = registrations.filter((r) => r.status === "waitlist");

  // Compute per-division player counts for the review panel
  const divisionCounts = (tournament.divisions ?? []).map((code: string) => {
    const divRegs = confirmedRegistrations.filter((r: any) => r.division === code);
    return {
      division: code,
      count: divRegs.length,
      playerNames: divRegs.map((r: any) => r.player?.display_name ?? "Unknown"),
    };
  }).filter((d) => d.count > 0);

  // Build partner lookup for doubles display
  const partnerMap: PartnerMap = new Map();
  if (tournament.type === "doubles") {
    for (const reg of confirmedRegistrations) {
      const r = reg as any;
      if (r.player_id && r.partner?.display_name) {
        partnerMap.set(r.player_id, r.partner.display_name);
      }
    }
  }

  // Group matches by division for display, using tournament.divisions order for stability
  const divisionMatchesTmp = new Map<string, typeof matches>();
  for (const m of matches) {
    const div = (m as any).division ?? "__none__";
    if (!divisionMatchesTmp.has(div)) divisionMatchesTmp.set(div, []);
    divisionMatchesTmp.get(div)!.push(m);
  }
  // Re-insert in stable order: tournament.divisions first, then any remaining keys
  const divisionMatches = new Map<string, typeof matches>();
  const divOrder = (tournament.divisions ?? []) as string[];
  for (const code of divOrder) {
    if (divisionMatchesTmp.has(code)) {
      divisionMatches.set(code, divisionMatchesTmp.get(code)!);
      divisionMatchesTmp.delete(code);
    }
  }
  for (const [key, val] of divisionMatchesTmp) {
    divisionMatches.set(key, val);
  }

  return (
    <div className="max-w-3xl lg:max-w-6xl mx-auto space-y-6">
      {/* Real-time bracket updates */}
      {isInProgress && <TournamentRealtimeSubscription tournamentId={id} />}

      <Breadcrumb items={[{ label: "Tournaments", href: "/tournaments" }, { label: tournament.title }]} />

      {/* Hero */}
      {(() => {
        const chip = tournamentDateChip(tournament.start_date, tournament.end_date ?? null);
        const heroTint = tournamentHeroGradient(id);
        const isLive = tournament.status === "in_progress";
        return (
          <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${heroTint} ring-1 ring-surface-border`}>
            <div className="p-5 sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[tournament.status]}`}>
                      {isLive && <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-accent-300 animate-pulse align-middle" />}
                      {STATUS_LABELS[tournament.status]}
                    </span>
                    {(tournament as any).is_hidden && canManage && (
                      <span className="inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium bg-amber-900/40 text-amber-300">
                        Hidden from public
                      </span>
                    )}
                  </div>
                  <h1 className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight text-dark-100 break-words">
                    {tournament.title}
                  </h1>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-surface-muted">
                    <span className="inline-flex items-center gap-1.5">
                      <svg className="h-4 w-4 text-surface-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0zM19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                      </svg>
                      {tournament.location}
                    </span>
                    {tournament.start_time && (
                      <span className="inline-flex items-center gap-1.5">
                        <svg className="h-4 w-4 text-surface-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z" />
                        </svg>
                        {formatTime(tournament.start_time)}
                      </span>
                    )}
                  </div>

                  {/* Format pill row */}
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    <span className="badge-blue text-xs">
                      {FORMAT_LABELS[tournament.format]}
                    </span>
                    <span className="badge-gray text-xs">
                      {tournament.type === "doubles" ? "Doubles" : "Singles"}
                    </span>
                    <span className="badge-gray text-xs">
                      {tournament.divisions?.length ?? 0} division{(tournament.divisions?.length ?? 0) !== 1 ? "s" : ""}
                    </span>
                  </div>
                </div>

                {/* Date chip */}
                <div className="shrink-0 text-right">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-surface-muted leading-none">
                    {chip.month}
                  </p>
                  <p className="text-4xl sm:text-5xl font-bold leading-none mt-1 text-dark-100">
                    {chip.day}
                    {chip.endDay && (
                      <span className="text-xl font-semibold text-surface-muted align-top ml-0.5">
                        {chip.endDay}
                      </span>
                    )}
                  </p>
                </div>
              </div>

              {/* Hero action row */}
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {matches.length > 0 && !(tournament as any).is_hidden && (
                  <ShareBracketButton tournamentId={id} />
                )}
                {canManage && (
                  <Link href={`/tournaments/${id}/edit`} className="btn-secondary text-xs">
                    Edit
                  </Link>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Details — a scannable label/value list rather than a long info-dump card */}
      <div className="card space-y-4">
        <dl className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
          <DetailRow label={`Organizer${coOrganizers.length > 0 ? "s" : ""}`}>
            <span className="text-sm text-dark-100">
              {tournament.creator?.display_name ?? "Unknown"}
              {coOrganizers.length > 0 && (
                <span className="text-dark-200">
                  {", "}{coOrganizers.map((o: any) => o.profile?.display_name ?? "Unknown").join(", ")}
                </span>
              )}
            </span>
          </DetailRow>
          <DetailRow label="Date">
            <span className="text-sm text-dark-100">
              {formatDate(tournament.start_date + "T00:00:00")}
              {tournament.end_date !== tournament.start_date && (
                <> — {formatDate(tournament.end_date + "T00:00:00")}</>
              )}
            </span>
          </DetailRow>
          {tournament.max_teams_per_division && (
            <DetailRow label="Max per Division">
              <span className="text-sm text-dark-100">{tournament.max_teams_per_division} teams</span>
            </DetailRow>
          )}
          {tournament.entry_fee && (
            <DetailRow label="Entry Fee">
              <span className="text-sm text-dark-100">{tournament.entry_fee}</span>
            </DetailRow>
          )}
          {tournament.registration_closes_at && (
            <DetailRow label="Registration Closes">
              <span className="text-sm text-dark-100">
                {formatDateTime(tournament.registration_closes_at)}
              </span>
            </DetailRow>
          )}
          {tournament.payment_options && tournament.payment_options.length > 0 && (
            <DetailRow label="Pay Via">
              <div className="space-y-1">
                {tournament.payment_options.map((opt) => (
                  <p key={opt.method} className="text-sm text-dark-100">
                    <span className="font-medium capitalize">{opt.method}</span>
                    {opt.detail && (
                      <span className="text-dark-200">
                        {" — "}
                        {opt.method === "paypal" || opt.method === "other"
                          ? <a href={opt.detail.startsWith("http") ? opt.detail : `https://${opt.detail}`} target="_blank" rel="noopener noreferrer" className="text-brand-vivid hover:underline">{opt.detail}</a>
                          : opt.detail}
                      </span>
                    )}
                  </p>
                ))}
              </div>
            </DetailRow>
          )}
          {(tournament as any).payment_link && (
            <DetailRow label="Payment Link">
              <a
                href={(tournament as any).payment_link}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-brand-vivid hover:underline break-all"
              >
                {(tournament as any).payment_link}
              </a>
            </DetailRow>
          )}
        </dl>

        {(tournament as any).payment_directions && (
          <div className="pt-3 border-t border-surface-border">
            <p className="text-xs text-surface-muted uppercase font-medium mb-1">Payment Directions</p>
            <p className="text-sm text-dark-100 whitespace-pre-line">{(tournament as any).payment_directions}</p>
          </div>
        )}

        {tournament.format === "round_robin" && (tournament.score_to_win_pool || tournament.score_to_win_playoff) && (
          <div className="pt-3 border-t border-surface-border">
            <div className="flex flex-wrap gap-4">
              <div>
                <p className="text-xs text-surface-muted uppercase font-medium">Pool Games To</p>
                <p className="text-sm text-dark-100">{tournament.score_to_win_pool ?? 11}</p>
              </div>
              <div>
                <p className="text-xs text-surface-muted uppercase font-medium">Playoff Games To</p>
                <p className="text-sm text-dark-100">{tournament.score_to_win_playoff ?? 11}</p>
              </div>
              {tournament.finals_best_of_3 && (
                <div>
                  <p className="text-xs text-surface-muted uppercase font-medium">Finals</p>
                  <p className="text-sm text-dark-100">Best 2 of 3</p>
                </div>
              )}
            </div>
          </div>
        )}

        {tournament.description && (
          <div className="pt-3 border-t border-surface-border">
            <p className="text-sm text-dark-200 whitespace-pre-wrap leading-relaxed">{tournament.description}</p>
          </div>
        )}

        {/* Contact Organizers — visible to logged-in non-organizers */}
        {profile && !canManage && (
          <div className="pt-3 border-t border-surface-border">
            <ContactOrganizersButton
              endpoint={`/api/tournaments/${id}/contact-organizers`}
              label="Contact Organizers"
            />
          </div>
        )}

        {/* Divisions */}
        {tournament.divisions && tournament.divisions.length > 0 && (
          <div className="pt-3 border-t border-surface-border">
            <p className="text-xs text-surface-muted uppercase font-medium mb-2">Divisions</p>
            <div className="flex flex-wrap gap-1.5">
              {tournament.divisions.map((code: string) => (
                <span key={code} className="badge-blue text-xs">
                  {getDivisionLabel(code)}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Registration Action */}
      <div id="register" />
      {profile && tournament.status === "registration_open" && (
        <TournamentRegistrationButton
          tournamentId={id}
          tournamentType={tournament.type}
          divisions={tournament.divisions ?? []}
          myRegistration={myRegistration}
          playerCap={tournament.player_cap}
          maxTeamsPerDivision={tournament.max_teams_per_division}
          confirmedCount={confirmedRegistrations.length}
          divisionConfirmedCounts={Object.fromEntries(
            (tournament.divisions ?? []).map((code: string) => [
              code,
              confirmedRegistrations.filter((r: any) => r.division === code).length,
            ])
          )}
        />
      )}

      {/* Organizer Controls */}
      {canManage && tournament.status !== "cancelled" && (
        <>
          {/* Division Review (shown when registration is closed, before bracket generation) */}
          {tournament.status === "registration_closed" && (
            <DivisionReview
              tournamentId={id}
              divisions={divisionCounts}
              format={tournament.format}
            />
          )}

          {/* Simple status controls for non-bracket transitions */}
          <OrganizerControls
            tournamentId={id}
            status={tournament.status}
          />
        </>
      )}

      {/* Co-Organizer Management — only creator or admin can manage */}
      {(isCreator || isAdmin) && (
        <CoOrganizerManager
          tournamentId={id}
          coOrganizers={coOrganizers}
          creatorId={tournament.created_by}
        />
      )}

      {/* Brackets by Division — tabbed UI when in_progress with multiple divisions */}
      {matches.length > 0 && (
        <DivisionBrackets
          divisionMatchesEntries={Array.from(divisionMatches.entries()).map(([div, divMatches]) => ({
            division: div,
            matches: divMatches,
          }))}
          tournament={{
            format: tournament.format,
            score_to_win_pool: tournament.score_to_win_pool ?? undefined,
            score_to_win_playoff: tournament.score_to_win_playoff ?? undefined,
            finals_best_of_3: tournament.finals_best_of_3 ?? undefined,
          }}
          canManage={canManage}
          tournamentId={id}
          myDivision={myDivision}
          partnerMap={partnerMap}
          isRoundRobin={tournament.format === "round_robin"}
        />
      )}

      {/* Registrations List */}
      <div>
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <h2 className="text-lg font-semibold text-dark-100">
            Registered ({confirmedRegistrations.length}{tournament.player_cap ? `/${tournament.player_cap}` : ""})
          </h2>
          {canManage && tournament.entry_fee && confirmedRegistrations.length > 0 && (() => {
            const paidCount = confirmedRegistrations.filter((r: any) => r.paid).length;
            const unpaidCount = confirmedRegistrations.length - paidCount;
            return (
              <>
                <span className="text-xs text-surface-muted">
                  {paidCount} of {confirmedRegistrations.length} paid
                </span>
                <PaymentReminderButton tournamentId={id} unpaidCount={unpaidCount} />
              </>
            );
          })()}
        </div>
        {confirmedRegistrations.length > 0 ? (
          <div className="card overflow-x-auto p-0">
            <table className="min-w-full divide-y divide-surface-border">
              <thead className="bg-surface-overlay">
                <tr>
                  <th className="px-2 sm:px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-surface-muted w-8">#</th>
                  <th className="px-2 sm:px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-surface-muted">Player</th>
                  {tournament.type === "doubles" && (
                    <th className="px-2 sm:px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-surface-muted">Partner</th>
                  )}
                  <th className="px-2 sm:px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-surface-muted">Division</th>
                  {canManage && (
                    <th className="px-2 sm:px-4 py-2 text-center text-xs font-medium uppercase tracking-wider text-surface-muted">Seed</th>
                  )}
                  {canManage && tournament.entry_fee && (
                    <th className="px-2 sm:px-4 py-2 text-center text-xs font-medium uppercase tracking-wider text-surface-muted">Paid</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border bg-surface-raised">
                {confirmedRegistrations.map((reg, i) => (
                  <tr key={reg.id}>
                    <td className="px-2 sm:px-4 py-2 text-sm text-surface-muted">{i + 1}</td>
                    <td className="px-2 sm:px-4 py-2 text-sm font-medium text-dark-100">
                      {(reg as any).player?.display_name ?? "Unknown"}
                    </td>
                    {tournament.type === "doubles" && (
                      <td className="px-2 sm:px-4 py-2 text-sm text-dark-200">
                        {(reg as any).partner?.display_name ?? "—"}
                      </td>
                    )}
                    <td className="px-2 sm:px-4 py-2 text-xs">
                      {(reg as any).division ? (
                        <span className="badge-blue">{getDivisionLabel((reg as any).division)}</span>
                      ) : (
                        <span className="text-surface-muted">—</span>
                      )}
                    </td>
                    {canManage && (
                      <td className="px-2 sm:px-4 py-2 text-center text-sm text-surface-muted">
                        {reg.seed ?? "—"}
                      </td>
                    )}
                    {canManage && tournament.entry_fee && (
                      <td className="px-2 sm:px-4 py-2 text-center">
                        <PaidToggle
                          registrationId={reg.id}
                          isPaid={(reg as any).paid ?? false}
                        />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="No registrations yet"
            description="Be the first to register for this tournament."
          />
        )}
      </div>

      {/* Waitlist */}
      {waitlistRegistrations.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-dark-100 mb-3">
            Waitlist ({waitlistRegistrations.length})
          </h2>
          {/* Group waitlist by division if there are multiple divisions */}
          {(tournament.divisions?.length ?? 0) > 1 ? (
            <div className="space-y-4">
              {(tournament.divisions ?? []).map((code: string) => {
                const divWaitlist = waitlistRegistrations
                  .filter((r: any) => r.division === code)
                  .sort((a, b) => (a.waitlist_position ?? 999) - (b.waitlist_position ?? 999));
                if (divWaitlist.length === 0) return null;
                return (
                  <div key={code}>
                    <p className="text-xs font-medium text-surface-muted uppercase mb-1">
                      {getDivisionLabel(code)}
                    </p>
                    <div className="card space-y-1">
                      {divWaitlist.map((reg, i) => (
                        <div key={reg.id} className="flex items-center gap-2 text-sm">
                          <span className="text-surface-muted w-6">{i + 1}.</span>
                          <span className="text-dark-200">{(reg as any).player?.display_name ?? "Unknown"}</span>
                          {tournament.type === "doubles" && (reg as any).partner && (
                            <span className="text-surface-muted">& {(reg as any).partner?.display_name}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="card space-y-1">
              {waitlistRegistrations.map((reg, i) => (
                <div key={reg.id} className="flex items-center gap-2 text-sm">
                  <span className="text-surface-muted w-6">{i + 1}.</span>
                  <span className="text-dark-200">{(reg as any).player?.display_name ?? "Unknown"}</span>
                  {tournament.type === "doubles" && (reg as any).partner && (
                    <span className="text-surface-muted">& {(reg as any).partner?.display_name}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Danger Zone — at the very bottom */}
      {canManage && tournament.status !== "cancelled" && (
        <div className="card border border-red-500/30">
          <h2 className="text-sm font-semibold text-red-400 mb-3">Danger Zone</h2>
          <div className="flex flex-wrap gap-2">
            {tournament.status !== "completed" && (
              <StatusAdvanceButton
                tournamentId={id}
                nextStatus="cancelled"
                label="Cancel Tournament"
                variant="danger"
              />
            )}
            <DeleteTournamentButton tournamentId={id} />
          </div>
        </div>
      )}
    </div>
  );
}

/** Single label → value cell used inside the tournament details grid. */
function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] text-surface-muted uppercase font-medium tracking-wide">
        {label}
      </dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}

function OrganizerControls({
  tournamentId,
  status,
}: {
  tournamentId: string;
  status: string;
}) {
  const nextAction: Record<string, { label: string; next: string; variant?: "primary" | "secondary" | "danger" }> = {
    draft: { label: "Open Registration", next: "registration_open" },
    registration_open: { label: "Close Registration", next: "registration_closed" },
    registration_closed: { label: "Reopen Registration", next: "registration_open", variant: "secondary" },
    in_progress: { label: "Mark Complete", next: "completed" },
  };

  const action = nextAction[status];

  if (!action) return null;

  return (
    <div className="card">
      <h2 className="text-sm font-semibold text-dark-200 mb-3">Organizer Controls</h2>
      <div className="flex flex-wrap gap-2">
        <StatusAdvanceButton
          tournamentId={tournamentId}
          nextStatus={action.next}
          label={action.label}
          variant={action.variant ?? "primary"}
        />
      </div>
    </div>
  );
}

function StatusAdvanceButton({
  tournamentId,
  nextStatus,
  label,
  variant = "primary",
}: {
  tournamentId: string;
  nextStatus: string;
  label: string;
  variant?: "primary" | "secondary" | "danger";
}) {
  async function advance() {
    "use server";
    const supabase = await createClient();
    await supabase
      .from("tournaments")
      .update({ status: nextStatus })
      .eq("id", tournamentId);
    const { revalidatePath } = await import("next/cache");
    revalidatePath(`/tournaments/${tournamentId}`);
  }

  return (
    <form action={advance}>
      <button
        type="submit"
        className={
          variant === "danger"
            ? "btn-secondary !border-red-500/50 !text-red-400 hover:!bg-red-900/20"
            : variant === "secondary"
            ? "btn-secondary"
            : "btn-primary"
        }
      >
        {label}
      </button>
    </form>
  );
}
