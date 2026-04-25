import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";

/**
 * /sessions/active — the Play tab. Routes the player to whichever
 * live experience applies right now, in this priority order:
 *   1. An active shootout session they're checked into.
 *   2. An active free-play session where they're checked in.
 *   3. A tournament division that an organizer has marked active
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

  // 2. Active free-play session the viewer is checked into. The
  //    session page lives at /groups/<slug>/session so we need the
  //    group's slug for the redirect.
  const { data: freePlayRows } = await supabase
    .from("free_play_session_players")
    .select(
      "session:free_play_sessions!inner(id, status, group:shootout_groups!inner(slug))"
    )
    .eq("player_id", profile.id)
    .limit(10);

  const activeFreePlay = (freePlayRows ?? []).find(
    (r: any) => r.session?.status === "active"
  ) as any;

  if (activeFreePlay?.session?.group?.slug) {
    redirect(`/groups/${activeFreePlay.session.group.slug}/session`);
  }

  // 3. Active tournament division. Find registrations tied to a
  //    tournament whose status is in_progress AND whose division is
  //    in tournament_active_divisions. `.or` so we catch users who
  //    joined as a partner via Ask-to-Partner (their row has them
  //    in partner_id, not player_id) — the old `.eq("player_id")`
  //    silently missed half of every team.
  const { data: tRegs } = await supabase
    .from("tournament_registrations")
    .select(
      "tournament_id, division, status, tournament:tournaments(id, status)"
    )
    .or(`player_id.eq.${profile.id},partner_id.eq.${profile.id}`)
    .neq("status", "withdrawn");

  // Multi-division registration means a player can have several rows
  // per tournament (e.g. Men's + Mixed). Look at every candidate, not
  // just the first — the one that's active might be the second row.
  const candidates = (tRegs ?? []).filter(
    (r: any) => r.tournament?.status === "in_progress"
  ) as { tournament_id: string; division: string }[];

  if (candidates.length > 0) {
    const tournamentIds = Array.from(new Set(candidates.map((c) => c.tournament_id)));
    const { data: activeRows } = await supabase
      .from("tournament_active_divisions")
      .select("tournament_id, division")
      .in("tournament_id", tournamentIds);
    const activeSet = new Set(
      (activeRows ?? []).map((r: any) => `${r.tournament_id}:${r.division}`)
    );
    const liveCandidate = candidates.find((c) =>
      activeSet.has(`${c.tournament_id}:${c.division}`)
    );
    if (liveCandidate) {
      redirect(`/tournaments/${liveCandidate.tournament_id}/live`);
    }
  }

  return (
    <div className="max-w-md mx-auto text-center py-16 space-y-4">
      <div className="flex justify-center">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-16 w-16 text-surface-muted">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
        </svg>
      </div>
      <h1 className="text-xl font-bold text-dark-100">Nothing to play right now</h1>
      <p className="text-surface-muted">
        When you&apos;re checked into a group session (ladder or free play) or an organizer flips your tournament division live, this tab will take you straight to your bracket or court.
      </p>
    </div>
  );
}
