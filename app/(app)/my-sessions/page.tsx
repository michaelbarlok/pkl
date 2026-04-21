import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { MySessionsList, type SessionHistoryItem } from "./my-sessions-list";

export const dynamic = "force-dynamic";

/**
 * /my-sessions — personal session history across every group the
 * viewer plays in.
 *
 * Pulls from two places:
 *   - shootout_sessions (ladder play): session_participants where
 *     checked_in = true, joined through to the group + sheet so we
 *     can show date and the player's pool_finish / step change.
 *   - free_play_sessions: free_play_session_players + matches, so
 *     W/L shows per session.
 *
 * Both kinds are merged, sorted by recency, and shipped to the
 * client for group-filtered rendering.
 */
export default async function MySessionsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/my-sessions");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", user.id)
    .single();
  if (!profile) redirect("/login?next=/my-sessions");

  // ----- Ladder / shootout sessions -----
  const { data: shootoutParticipations } = await supabase
    .from("session_participants")
    .select(
      `session_id, pool_finish, step_before, step_after, court_number, checked_in,
       session:shootout_sessions!inner(
         id, status, current_round, created_at, group_id, sheet_id,
         group:shootout_groups(id, name, slug, group_type),
         sheet:signup_sheets(event_date)
       )`
    )
    .eq("player_id", profile.id)
    .eq("checked_in", true)
    .order("created_at", { ascending: false, foreignTable: "session:shootout_sessions" })
    .limit(200);

  const shootoutSessionIds = (shootoutParticipations ?? [])
    .map((r: any) => r.session?.id)
    .filter(Boolean);

  // Pull game_results for those sessions so we can tally the viewer's
  // W/L per session in JS.
  const { data: shootoutGames } = shootoutSessionIds.length
    ? await supabase
        .from("game_results")
        .select(
          "session_id, team_a_p1, team_a_p2, team_b_p1, team_b_p2, score_a, score_b"
        )
        .in("session_id", shootoutSessionIds)
    : { data: [] as any[] };

  const shootoutStats = new Map<string, { wins: number; losses: number; pointDiff: number }>();
  for (const g of shootoutGames ?? []) {
    const isA = g.team_a_p1 === profile.id || g.team_a_p2 === profile.id;
    const isB = g.team_b_p1 === profile.id || g.team_b_p2 === profile.id;
    if (!isA && !isB) continue;
    const my = isA ? g.score_a : g.score_b;
    const opp = isA ? g.score_b : g.score_a;
    const rec = shootoutStats.get(g.session_id) ?? { wins: 0, losses: 0, pointDiff: 0 };
    if (my > opp) rec.wins++;
    else if (my < opp) rec.losses++;
    rec.pointDiff += my - opp;
    shootoutStats.set(g.session_id, rec);
  }

  const shootoutItems: SessionHistoryItem[] = (shootoutParticipations ?? [])
    .map((r: any) => {
      const s = r.session;
      if (!s || s.status !== "session_complete") return null;
      const stats = shootoutStats.get(s.id) ?? { wins: 0, losses: 0, pointDiff: 0 };
      return {
        kind: "ladder" as const,
        id: s.id,
        href: `/sessions/${s.id}`,
        groupId: s.group?.id ?? s.group_id,
        groupName: s.group?.name ?? "—",
        groupSlug: s.group?.slug ?? null,
        groupType: s.group?.group_type ?? "ladder_league",
        eventDate: s.sheet?.event_date ?? null,
        createdAt: s.created_at,
        wins: stats.wins,
        losses: stats.losses,
        pointDiff: stats.pointDiff,
        poolFinish: r.pool_finish ?? null,
        stepBefore: r.step_before ?? null,
        stepAfter: r.step_after ?? null,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  // ----- Free-play sessions -----
  const { data: freePlayParticipations } = await supabase
    .from("free_play_session_players")
    .select(
      `session_id,
       session:free_play_sessions!inner(
         id, status, created_at, group_id,
         group:shootout_groups(id, name, slug, group_type)
       )`
    )
    .eq("player_id", profile.id)
    .order("created_at", { ascending: false, foreignTable: "session:free_play_sessions" })
    .limit(200);

  const freePlaySessionIds = (freePlayParticipations ?? [])
    .map((r: any) => r.session?.id)
    .filter(Boolean);

  const { data: freePlayMatches } = freePlaySessionIds.length
    ? await supabase
        .from("free_play_matches")
        .select(
          "session_id, team_a_p1, team_a_p2, team_b_p1, team_b_p2, score_a, score_b"
        )
        .in("session_id", freePlaySessionIds)
    : { data: [] as any[] };

  const freePlayStats = new Map<string, { wins: number; losses: number; pointDiff: number }>();
  for (const g of freePlayMatches ?? []) {
    const isA = g.team_a_p1 === profile.id || g.team_a_p2 === profile.id;
    const isB = g.team_b_p1 === profile.id || g.team_b_p2 === profile.id;
    if (!isA && !isB) continue;
    const my = isA ? g.score_a : g.score_b;
    const opp = isA ? g.score_b : g.score_a;
    const rec = freePlayStats.get(g.session_id) ?? { wins: 0, losses: 0, pointDiff: 0 };
    if (my > opp) rec.wins++;
    else if (my < opp) rec.losses++;
    rec.pointDiff += my - opp;
    freePlayStats.set(g.session_id, rec);
  }

  const freePlayItems: SessionHistoryItem[] = (freePlayParticipations ?? [])
    .map((r: any) => {
      const s = r.session;
      if (!s) return null;
      const stats = freePlayStats.get(s.id) ?? { wins: 0, losses: 0, pointDiff: 0 };
      return {
        kind: "free_play" as const,
        id: s.id,
        // Free-play session detail page lives under the group.
        href: s.group?.slug
          ? `/groups/${s.group.slug}/sessions/${s.id}`
          : `/groups/${s.group_id}/sessions/${s.id}`,
        groupId: s.group?.id ?? s.group_id,
        groupName: s.group?.name ?? "—",
        groupSlug: s.group?.slug ?? null,
        groupType: s.group?.group_type ?? "free_play",
        eventDate: null,
        createdAt: s.created_at,
        wins: stats.wins,
        losses: stats.losses,
        pointDiff: stats.pointDiff,
        poolFinish: null,
        stepBefore: null,
        stepAfter: null,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const all = [...shootoutItems, ...freePlayItems].sort((a, b) => {
    const ak = a.eventDate ?? a.createdAt ?? "";
    const bk = b.eventDate ?? b.createdAt ?? "";
    return bk.localeCompare(ak);
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-heading">My Sessions</h1>
        <p className="mt-1 text-sm text-surface-muted">
          Every session you&apos;ve played across your groups. Tap a row to
          see the full details — court, match scores, and step changes.
        </p>
      </div>

      <MySessionsList items={all} />
    </div>
  );
}
