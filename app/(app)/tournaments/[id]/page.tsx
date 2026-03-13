import { getTournament, getTournamentRegistrations, getTournamentMatches, getMyRegistration } from "@/lib/queries/tournament";
import { createClient } from "@/lib/supabase/server";
import { TournamentRegistrationButton } from "@/components/tournament-registration";
import { TournamentBracketView } from "@/components/tournament-bracket";
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

  // Check if current user is the creator
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from("profiles").select("id, role").eq("user_id", user.id).single()
    : { data: null };
  const isCreator = profile?.id === tournament.created_by;
  const isAdmin = profile?.role === "admin";
  const canManage = isCreator || isAdmin;

  const confirmedRegistrations = registrations.filter((r) => r.status === "confirmed");
  const waitlistRegistrations = registrations.filter((r) => r.status === "waitlist");

  return (
    <div className="max-w-3xl mx-auto space-y-6">
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
            {tournament.skill_level !== "open" && ` &middot; ${tournament.skill_level}`}
          </span>
        </div>
      </div>

      {/* Details Card */}
      <div className="card space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <p className="text-xs text-surface-muted uppercase font-medium">Date</p>
            <p className="text-sm text-dark-100">
              {new Date(tournament.start_date + "T00:00:00").toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
              {tournament.end_date !== tournament.start_date && (
                <> — {new Date(tournament.end_date + "T00:00:00").toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                })}</>
              )}
            </p>
          </div>
          {tournament.start_time && (
            <div>
              <p className="text-xs text-surface-muted uppercase font-medium">Time</p>
              <p className="text-sm text-dark-100">{tournament.start_time.slice(0, 5)}</p>
            </div>
          )}
          <div>
            <p className="text-xs text-surface-muted uppercase font-medium">Location</p>
            <p className="text-sm text-dark-100">{tournament.location}</p>
          </div>
          <div>
            <p className="text-xs text-surface-muted uppercase font-medium">Organizer</p>
            <p className="text-sm text-dark-100">{tournament.creator?.display_name ?? "Unknown"}</p>
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
                {new Date(tournament.registration_closes_at).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </p>
            </div>
          )}
        </div>

        {tournament.description && (
          <div className="pt-3 border-t border-surface-border">
            <p className="text-sm text-dark-200 whitespace-pre-wrap">{tournament.description}</p>
          </div>
        )}
      </div>

      {/* Registration Action */}
      {profile && tournament.status === "registration_open" && (
        <TournamentRegistrationButton
          tournamentId={id}
          tournamentType={tournament.type}
          myRegistration={myRegistration}
          playerCap={tournament.player_cap}
          confirmedCount={confirmedRegistrations.length}
        />
      )}

      {/* Organizer Controls */}
      {canManage && tournament.status !== "cancelled" && (
        <OrganizerControls
          tournamentId={id}
          status={tournament.status}
          registrationCount={confirmedRegistrations.length}
        />
      )}

      {/* Bracket / Matches */}
      {matches.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-dark-100 mb-3">Bracket</h2>
          <TournamentBracketView
            matches={matches}
            format={tournament.format}
            canManage={canManage}
            tournamentId={id}
          />
        </div>
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
  registrationCount,
}: {
  tournamentId: string;
  status: string;
  registrationCount: number;
}) {
  const nextAction: Record<string, { label: string; next: string; api?: string }> = {
    draft: { label: "Open Registration", next: "registration_open" },
    registration_open: { label: "Close Registration", next: "registration_closed" },
    registration_closed: { label: "Generate Bracket & Start", next: "in_progress", api: "bracket" },
    in_progress: { label: "Mark Complete", next: "completed" },
  };

  const action = nextAction[status];
  if (!action) return null;

  return (
    <div className="card">
      <h2 className="text-sm font-semibold text-dark-200 mb-3">Organizer Controls</h2>
      <form
        action={action.api ? `/api/tournaments/${tournamentId}/bracket` : undefined}
        method={action.api ? "POST" : undefined}
      >
        <input type="hidden" name="next_status" value={action.next} />
        <div className="flex flex-wrap gap-2">
          {action.api ? (
            <button type="submit" className="btn-primary" disabled={registrationCount < 2}>
              {action.label}
            </button>
          ) : (
            <StatusAdvanceButton
              tournamentId={tournamentId}
              nextStatus={action.next}
              label={action.label}
            />
          )}
          {status !== "completed" && (
            <StatusAdvanceButton
              tournamentId={tournamentId}
              nextStatus="cancelled"
              label="Cancel Tournament"
              variant="danger"
            />
          )}
        </div>
      </form>
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
