import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { SessionRecapAdmin } from "./session-recap-client";

export default async function FreePlaySessionRecapPage({
  params,
}: {
  params: Promise<{ slug: string; sessionId: string }>;
}) {
  const { slug, sessionId } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) notFound();

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, display_name, role")
    .eq("user_id", user.id)
    .single();
  if (!profile) notFound();

  const { data: session } = await supabase
    .from("free_play_sessions")
    .select("*, group:shootout_groups(id, name, slug)")
    .eq("id", sessionId)
    .single();

  if (!session || (session.group as any)?.slug !== slug) notFound();

  const group = session.group as { id: string; name: string; slug: string };

  // Admin check
  const { data: membership } = await supabase
    .from("group_memberships")
    .select("group_role")
    .eq("group_id", group.id)
    .eq("player_id", profile.id)
    .maybeSingle();
  const isAdmin = profile.role === "admin" || membership?.group_role === "admin";

  // Fetch ALL matches for the session
  const { data: allMatches } = await supabase
    .from("free_play_matches")
    .select("id, team_a_p1, team_a_p2, team_b_p1, team_b_p2, score_a, score_b, round_number")
    .eq("session_id", sessionId)
    .order("round_number", { ascending: true })
    .order("created_at", { ascending: true });

  // Fetch session players with display names
  const { data: sessionPlayers } = await supabase
    .from("free_play_session_players")
    .select("player_id, profiles(id, display_name)")
    .eq("session_id", sessionId);

  const players = (sessionPlayers ?? []).map((sp) => ({
    id: sp.player_id as string,
    displayName: (sp.profiles as any)?.display_name ?? "Unknown",
  }));

  // Current user's personal stats (from their own matches)
  const myMatches = (allMatches ?? []).filter(
    (m) =>
      m.team_a_p1 === profile.id ||
      m.team_a_p2 === profile.id ||
      m.team_b_p1 === profile.id ||
      m.team_b_p2 === profile.id
  );

  let wins = 0, losses = 0, gamesPlayed = 0, pointsWon = 0, pointsPossible = 0, pointDiff = 0;
  for (const m of myMatches) {
    const onTeamA = m.team_a_p1 === profile.id || m.team_a_p2 === profile.id;
    const myScore = onTeamA ? m.score_a : m.score_b;
    const theirScore = onTeamA ? m.score_b : m.score_a;
    pointsWon += myScore;
    pointsPossible += Math.max(m.score_a, m.score_b);
    pointDiff += myScore - theirScore;
    gamesPlayed++;
    if (myScore > theirScore) wins++;
    else if (myScore < theirScore) losses++;
  }

  const pct = pointsPossible > 0 ? Math.round((pointsWon / pointsPossible) * 100) : 0;

  const sessionDate = new Date(session.created_at).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="max-w-lg mx-auto space-y-6 animate-fade-in">
      <Link
        href={`/groups/${slug}`}
        className="inline-flex items-center gap-1 text-sm text-brand-400 hover:text-brand-300"
      >
        ← {group.name}
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-dark-100">Session Recap</h1>
        <p className="text-sm text-surface-muted mt-0.5">{sessionDate}</p>
      </div>

      {gamesPlayed === 0 ? (
        <div className="card text-center text-surface-muted text-sm py-8">
          No matches recorded for you in this session.
        </div>
      ) : (
        <>
          {/* Personal stats tiles */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="card text-center">
              <p className="text-2xl font-bold text-dark-100">
                {wins}–{losses}
              </p>
              <p className="text-xs text-surface-muted mt-0.5">W – L</p>
            </div>
            <div className="card text-center">
              <p className="text-2xl font-bold text-dark-100">{gamesPlayed}</p>
              <p className="text-xs text-surface-muted mt-0.5">Games</p>
            </div>
            <div className="card text-center">
              <p className="text-2xl font-bold text-dark-100">{pct}%</p>
              <p className="text-xs text-surface-muted mt-0.5">Pt Win %</p>
            </div>
            <div className="card text-center">
              <p
                className={`text-2xl font-bold ${
                  pointDiff > 0
                    ? "text-teal-400"
                    : pointDiff < 0
                    ? "text-red-400"
                    : "text-dark-100"
                }`}
              >
                {pointDiff > 0 ? "+" : ""}
                {pointDiff}
              </p>
              <p className="text-xs text-surface-muted mt-0.5">Pt Diff</p>
            </div>
          </div>

          {/* Personal match breakdown */}
          <div className="card">
            <h2 className="text-sm font-semibold text-dark-100 mb-3">
              My Matches
            </h2>
            <div className="space-y-2">
              {myMatches.map((m, i) => {
                const onTeamA =
                  m.team_a_p1 === profile.id || m.team_a_p2 === profile.id;
                const myScore = onTeamA ? m.score_a : m.score_b;
                const theirScore = onTeamA ? m.score_b : m.score_a;
                const won = myScore > theirScore;
                const lost = myScore < theirScore;
                return (
                  <div
                    key={i}
                    className="flex items-center justify-between py-1.5 border-b border-surface-border/40 last:border-0"
                  >
                    <span className="text-xs text-surface-muted w-16">
                      Round {m.round_number}
                    </span>
                    <span className="text-sm font-semibold text-dark-100">
                      {myScore} – {theirScore}
                    </span>
                    <span
                      className={`text-xs font-bold w-6 text-right ${
                        won
                          ? "text-teal-400"
                          : lost
                          ? "text-red-400"
                          : "text-surface-muted"
                      }`}
                    >
                      {won ? "W" : lost ? "L" : "T"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* All matches — with admin editing */}
      {(allMatches ?? []).length > 0 && (
        <SessionRecapAdmin
          groupId={group.id}
          sessionId={sessionId}
          initialMatches={allMatches ?? []}
          sessionPlayers={players}
          isAdmin={isAdmin}
        />
      )}

      <div className="text-center pb-4">
        <Link href={`/groups/${slug}`} className="btn-secondary text-sm">
          Back to Group
        </Link>
      </div>
    </div>
  );
}
