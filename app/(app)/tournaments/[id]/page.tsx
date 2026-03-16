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
import { formatDate, formatTime, formatDateTime } from "@/lib/utils";
import Link from "next/link";
import { notFound } from "next/navigation";

const FORMAT_LABELS: Record<string, string> = {
  single_elimination: "Single Elimination",
  double_elimination: "Double Elimination",
  round_robin: "Round Robin",
};

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-surface-overlay text-dark-200",
  registration_open: "bg-teal-900/30 text-teal-300",
  registration_closed: "bg-brand-900/40 text-brand-300",
  in_progress: "bg-accent-900/40 text-accent-300",
  completed: "bg-surface-overlay text-dark-200",
  cancelled: "bg-red-900/30 text-red-400",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  registration_open: "Registration Open",
  registration_closed: "Registration Closed",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

export default async function TournamentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [tournament, registrations, matches, myRegistration] = await Promise.all([
    getTournament(id),
    getTournamentRegistrations(id),
    getTournamentMatches(id),
    getMyRegistration(id),
  ]);

  if (!tournament) notFound();

  // Check if current user can manage this tournament
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from("profiles").select("id, role").eq("user_id", user.id).single()
    : { data: null };
  const isCreator = profile?.id === tournament.created_by;
  const isAdmin = profile?.role === "admin";

  // Fetch co-organizers
  const { data: organizers } = await supabase
    .from("tournament_organizers")
    .select("profile_id, added_at, profile:profiles!profile_id(id, display_name)")
    .eq("tournament_id", id);
  const coOrganizers = (organizers ?? []) as any[];
  const isCoOrganizer = profile ? coOrganizers.some((o: any) => o.profile_id === profile.id) : false;
  const canManage = isCreator || isAdmin || isCoOrganizer;

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
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Real-time bracket updates */}
      {isInProgress && <TournamentRealtimeSubscription tournamentId={id} />}

      {/* Header */}
      <div>
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-2xl font-bold text-dark-100">{tournament.title}</h1>
          {canManage && (
            <Link href={`/tournaments/${id}/edit`} className="btn-secondary text-xs shrink-0">
              Edit
            </Link>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-2">
          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[tournament.status]}`}>
            {STATUS_LABELS[tournament.status]}
          </span>
          <span className="text-xs text-surface-muted">
            {FORMAT_LABELS[tournament.format]} &middot; {tournament.type === "doubles" ? "Doubles" : "Singles"}
            &middot; {tournament.divisions?.length ?? 0} division{(tournament.divisions?.length ?? 0) !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* Details Card */}
      <div className="card space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <p className="text-xs text-surface-muted uppercase font-medium">Date</p>
            <p className="text-sm text-dark-100">
              {formatDate(tournament.start_date + "T00:00:00")}
              {tournament.end_date !== tournament.start_date && (
                <> — {formatDate(tournament.end_date + "T00:00:00")}</>
              )}
            </p>
          </div>
          {tournament.start_time && (
            <div>
              <p className="text-xs text-surface-muted uppercase font-medium">Time</p>
              <p className="text-sm text-dark-100">{formatTime(tournament.start_time)}</p>
            </div>
          )}
          <div>
            <p className="text-xs text-surface-muted uppercase font-medium">Location</p>
            <p className="text-sm text-dark-100">{tournament.location}</p>
          </div>
          <div>
            <p className="text-xs text-surface-muted uppercase font-medium">Organizer{coOrganizers.length > 0 ? "s" : ""}</p>
            <p className="text-sm text-dark-100">
              {tournament.creator?.display_name ?? "Unknown"}
              {coOrganizers.length > 0 && (
                <span className="text-dark-200">
                  {", "}{coOrganizers.map((o: any) => o.profile?.display_name ?? "Unknown").join(", ")}
                </span>
              )}
            </p>
          </div>
          {tournament.entry_fee && (
            <div>
              <p className="text-xs text-surface-muted uppercase font-medium">Entry Fee</p>
              <p className="text-sm text-dark-100">{tournament.entry_fee}</p>
            </div>
          )}
          {tournament.registration_closes_at && (
            <div>
              <p className="text-xs text-surface-muted uppercase font-medium">Registration Closes</p>
              <p className="text-sm text-dark-100">
                {formatDateTime(tournament.registration_closes_at)}
              </p>
            </div>
          )}
        </div>
        {tournament.format === "round_robin" && (tournament.score_to_win_pool || tournament.score_to_win_playoff) && (
          <div className="border-t border-surface-border pt-3">
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
            <p className="text-sm text-dark-200 whitespace-pre-wrap">{tournament.description}</p>
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
          confirmedCount={confirmedRegistrations.length}
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

      {/* Delete — always visible to admins/organizers */}
      {canManage && (
        <div className="card">
          <h2 className="text-sm font-semibold text-dark-200 mb-3">Danger Zone</h2>
          <DeleteTournamentButton tournamentId={id} />
        </div>
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
        <h2 className="text-lg font-semibold text-dark-100 mb-3">
          Registered ({confirmedRegistrations.length}{tournament.player_cap ? `/${tournament.player_cap}` : ""})
        </h2>
        {confirmedRegistrations.length > 0 ? (
          <div className="card overflow-x-auto p-0">
            <table className="min-w-full divide-y divide-surface-border">
              <thead className="bg-surface-overlay">
                <tr>
                  <th className="px-2 sm:px-4 py-2 text-left text-xs font-medium uppercase text-surface-muted w-8">#</th>
                  <th className="px-2 sm:px-4 py-2 text-left text-xs font-medium uppercase text-surface-muted">Player</th>
                  {tournament.type === "doubles" && (
                    <th className="px-2 sm:px-4 py-2 text-left text-xs font-medium uppercase text-surface-muted">Partner</th>
                  )}
                  <th className="px-2 sm:px-4 py-2 text-left text-xs font-medium uppercase text-surface-muted">Division</th>
                  {canManage && (
                    <th className="px-2 sm:px-4 py-2 text-center text-xs font-medium uppercase text-surface-muted">Seed</th>
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="card text-center text-surface-muted">
            <p>No registrations yet.</p>
          </div>
        )}
      </div>

      {/* Waitlist */}
      {waitlistRegistrations.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-dark-100 mb-3">
            Waitlist ({waitlistRegistrations.length})
          </h2>
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
        </div>
      )}
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
  // registration_closed is handled by DivisionReview above
  const nextAction: Record<string, { label: string; next: string }> = {
    draft: { label: "Open Registration", next: "registration_open" },
    registration_open: { label: "Close Registration", next: "registration_closed" },
    in_progress: { label: "Mark Complete", next: "completed" },
  };

  const action = nextAction[status];
  const showCancel = status !== "completed" && status !== "registration_closed";

  if (!action && !showCancel) return null;

  return (
    <div className="card">
      <h2 className="text-sm font-semibold text-dark-200 mb-3">Organizer Controls</h2>
      <div className="flex flex-wrap gap-2">
        {action && (
          <StatusAdvanceButton
            tournamentId={tournamentId}
            nextStatus={action.next}
            label={action.label}
          />
        )}
        {showCancel && (
          <StatusAdvanceButton
            tournamentId={tournamentId}
            nextStatus="cancelled"
            label="Cancel Tournament"
            variant="danger"
          />
        )}
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
  variant?: "primary" | "danger";
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
        className={variant === "danger"
          ? "btn-secondary !border-red-500/50 !text-red-400 hover:!bg-red-900/20"
          : "btn-primary"
        }
      >
        {label}
      </button>
    </form>
  );
}
