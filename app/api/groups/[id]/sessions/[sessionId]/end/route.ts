import { requireAuth } from "@/lib/auth";
import { notify } from "@/lib/notify";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/groups/[id]/sessions/[sessionId]/end
 *
 * Persists the final round's scores (if any), marks the session
 * as completed, and returns the session.
 *
 * Body: { scores?: { scoreA: number, scoreB: number }[] }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; sessionId: string }> }
) {
  const { id: groupId, sessionId } = await params;
  const body = await request.json().catch(() => ({}));
  const { scores } = body as { scores?: { scoreA: number; scoreB: number }[] };

  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  // Get session with group info
  const { data: session } = await auth.supabase
    .from("free_play_sessions")
    .select("*, group:shootout_groups(name, slug)")
    .eq("id", sessionId)
    .eq("group_id", groupId)
    .eq("status", "active")
    .single();

  if (!session) {
    return NextResponse.json({ error: "Active session not found" }, { status: 404 });
  }

  const round = session.current_round as any;

  // If scores provided for the current round, persist them first.
  // Same group-level scoring rule check as next-round so an end-of-
  // session save can't slip past validation that the round-advance
  // path enforces.
  if (scores && round && scores.length === round.matches.length) {
    const { data: prefs } = await auth.supabase
      .from("group_preferences")
      .select("game_limit_4p, win_by_2")
      .eq("group_id", groupId)
      .maybeSingle();

    if (prefs && typeof prefs.game_limit_4p === "number" && prefs.game_limit_4p > 0) {
      const gameLimit = prefs.game_limit_4p;
      for (let i = 0; i < scores.length; i++) {
        const a = scores[i].scoreA;
        const b = scores[i].scoreB;
        if (typeof a !== "number" || typeof b !== "number" || a < 0 || b < 0) {
          return NextResponse.json(
            { error: `Match ${i + 1}: scores must be non-negative numbers.` },
            { status: 400 }
          );
        }
        const hi = Math.max(a, b);
        const lo = Math.min(a, b);
        if (hi < gameLimit) {
          return NextResponse.json(
            {
              error: prefs.win_by_2
                ? `Match ${i + 1}: at least one team must reach ${gameLimit} (win by 2).`
                : `Match ${i + 1}: at least one team must reach ${gameLimit}.`,
            },
            { status: 400 }
          );
        }
        if (prefs.win_by_2) {
          if (hi === gameLimit) {
            if (hi - lo < 2) {
              return NextResponse.json(
                { error: `Match ${i + 1}: win by 2 — ${hi}-${lo} isn't a valid finish.` },
                { status: 400 }
              );
            }
          } else if (hi - lo !== 2) {
            return NextResponse.json(
              {
                error: `Match ${i + 1}: win by 2 — once past ${gameLimit}, the winner must lead by exactly 2 (e.g. ${gameLimit + 1}-${gameLimit - 1}).`,
              },
              { status: 400 }
            );
          }
        } else if (hi === lo) {
          return NextResponse.json(
            { error: `Match ${i + 1}: tie scores aren't allowed — someone has to win.` },
            { status: 400 }
          );
        }
      }
    }

    const matchRows = round.matches.map((m: any, i: number) => ({
      group_id: groupId,
      created_by: auth.profile.id,
      session_id: sessionId,
      round_number: round.roundNumber,
      team_a_p1: m.teamA[0],
      team_a_p2: m.teamA[1],
      team_b_p1: m.teamB[0],
      team_b_p2: m.teamB[1],
      score_a: scores[i].scoreA,
      score_b: scores[i].scoreB,
    }));

    await auth.supabase.from("free_play_matches").insert(matchRows);
  }

  // Mark session as completed
  const { data: updated, error: updateError } = await auth.supabase
    .from("free_play_sessions")
    .update({
      status: "completed",
      ended_at: new Date().toISOString(),
      current_round: null,
    })
    .eq("id", sessionId)
    .select()
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Send recap notifications non-blocking
  const group = session.group as { name: string; slug: string } | null;
  if (group) {
    sendFreePlayRecapNotifications(
      auth.supabase,
      sessionId,
      groupId,
      group.slug,
      group.name,
      session.created_at,
    ).catch((e) => console.error("Free play recap notifications failed:", e));
  }

  return NextResponse.json(updated);
}

async function sendFreePlayRecapNotifications(
  supabase: any,
  sessionId: string,
  groupId: string,
  groupSlug: string,
  groupName: string,
  createdAt: string,
) {
  const [{ data: sessionPlayers }, { data: matches }] = await Promise.all([
    supabase
      .from("free_play_session_players")
      .select("player_id, player:profiles(id, display_name)")
      .eq("session_id", sessionId),
    supabase
      .from("free_play_matches")
      .select("team_a_p1, team_a_p2, team_b_p1, team_b_p2, score_a, score_b")
      .eq("session_id", sessionId),
  ]);

  if (!sessionPlayers || sessionPlayers.length === 0) return;

  // Compute per-player session stats
  type Stats = { wins: number; losses: number; gamesPlayed: number; pointsWon: number; pointsPossible: number; pointDiff: number };
  const statsMap = new Map<string, Stats>();
  for (const p of sessionPlayers) {
    statsMap.set(p.player_id, { wins: 0, losses: 0, gamesPlayed: 0, pointsWon: 0, pointsPossible: 0, pointDiff: 0 });
  }

  for (const m of matches ?? []) {
    const teamA = [m.team_a_p1, m.team_a_p2].filter(Boolean) as string[];
    const teamB = [m.team_b_p1, m.team_b_p2].filter(Boolean) as string[];
    const possible = Math.max(m.score_a, m.score_b);
    const aWon = m.score_a > m.score_b;

    for (const pid of teamA) {
      const s = statsMap.get(pid);
      if (!s) continue;
      s.gamesPlayed++;
      s.pointsWon += m.score_a;
      s.pointsPossible += possible;
      s.pointDiff += m.score_a - m.score_b;
      if (m.score_a !== m.score_b) aWon ? s.wins++ : s.losses++;
    }
    for (const pid of teamB) {
      const s = statsMap.get(pid);
      if (!s) continue;
      s.gamesPlayed++;
      s.pointsWon += m.score_b;
      s.pointsPossible += possible;
      s.pointDiff += m.score_b - m.score_a;
      if (m.score_a !== m.score_b) !aWon ? s.wins++ : s.losses++;
    }
  }

  const sessionDate = new Date(createdAt).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });

  for (const sp of sessionPlayers) {
    const s = statsMap.get(sp.player_id);
    if (!s) continue;
    const playerName = (sp.player as any)?.display_name ?? "Player";
    const bodyParts = [`Record: ${s.wins}W – ${s.losses}L.`, `Pt diff: ${s.pointDiff >= 0 ? "+" : ""}${s.pointDiff}.`];

    notify({
      profileId: sp.player_id,
      type: "session_recap",
      title: `${groupName} recap — ${sessionDate}`,
      body: bodyParts.join(" "),
      link: `/groups/${groupSlug}/sessions/${sessionId}`,
      groupId,
      emailTemplate: "FreePlayRecap",
      emailData: {
        playerName,
        groupName,
        sessionDate,
        wins: s.wins,
        losses: s.losses,
        gamesPlayed: s.gamesPlayed,
        pointsWon: s.pointsWon,
        pointsPossible: s.pointsPossible,
        pointDiff: s.pointDiff,
        sessionId,
        groupSlug,
      },
    }).catch((e) => console.error(`Recap failed for ${sp.player_id}:`, e));
  }
}
