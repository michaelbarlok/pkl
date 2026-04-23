import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";

/**
 * /sessions/active — the Play tab. Routes the player to whichever
 * live experience applies right now, in this priority order:
 *   1. An active shootout session they're checked into.
 *   2. A tournament division that an organizer has marked active
 *      and in which they're registered (tournament.status = in_progress).
 * Falls back to a "nothing active" empty state.
 */
export default async function ActiveSessionPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!profile) notFound();

  // 1. Active shootout session takes priority — it's usually the
  //    shorter-running event and the tab was originally built for it.
  const { data: participants } = await supabase
    .from("session_participants")
    .select("session_id, session:shootout_sessions(id, status)")
    .eq("player_id", profile.id)
    .eq("checked_in", true)
    .limit(10);

  const active = participants?.find((p: any) => {
    const status = p.session?.status;
    return status && !["session_complete", "created"].includes(status);
  });

  if (active) {
    redirect(`/sessions/${active.session_id}`);
  }

  // 2. Active tournament division. Find registrations tied to a
  //    tournament whose status is in_progress AND whose division is
  //    in tournament_active_divisions.
  const { data: tRegs } = await supabase
    .from("tournament_registrations")
    .select(
      "tournament_id, division, status, tournament:tournaments(id, status)"
    )
    .eq("player_id", profile.id)
    .neq("status", "withdrawn");

  const candidate = (tRegs ?? []).find(
    (r: any) => r.tournament?.status === "in_progress"
  ) as any;

  if (candidate) {
    const { data: active } = await supabase
      .from("tournament_active_divisions")
      .select("division")
      .eq("tournament_id", candidate.tournament_id)
      .eq("division", candidate.division)
      .maybeSingle();
    if (active) {
      redirect(`/tournaments/${candidate.tournament_id}/live`);
    }
  }

  return (
    <div className="max-w-md mx-auto text-center py-16 space-y-4">
      <div className="flex justify-center">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-16 w-16 text-surface-muted">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
        </svg>
      </div>
      <h1 className="text-xl font-bold text-dark-100">No Active Session</h1>
      <p className="text-surface-muted">
        You don&apos;t have an active session right now. When you&apos;re checked into a session, you&apos;ll be taken straight to your court.
      </p>
    </div>
  );
}
