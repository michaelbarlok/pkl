import { requireAuth, isGroupAdmin } from "@/lib/auth";
import { notify } from "@/lib/notify";
import { recomputeSessionStats } from "@/lib/session-recompute";
import { NextRequest, NextResponse } from "next/server";
import { formatDate } from "@/lib/utils";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const { id: sessionId } = await params;

  // Parse body — sendRecap can be set to false from the Play Again flow,
  // which calls this endpoint internally to finalize step movement and
  // target_court_next without notifying every player they're "done."
  let sendRecap = true;
  try {
    const body = await request.json();
    if (body && body.sendRecap === false) sendRecap = false;
  } catch {
    // No body — keep default sendRecap=true (the End Session button case).
  }

  // Fetch session with group and sheet info
  const { data: session } = await auth.supabase
    .from("shootout_sessions")
    .select("*, group:shootout_groups(id, name, ladder_type), sheet:signup_sheets(event_date, location)")
    .eq("id", sessionId)
    .single();

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  // Verify caller is group admin or app admin
  const canManage = await isGroupAdmin(auth.supabase, auth.profile.id, session.group_id, auth.profile.role);
  if (!canManage) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (session.status === "session_complete") {
    return NextResponse.json({ error: "Session is already complete" }, { status: 400 });
  }

  // If admin skipped Complete Round (or only partially scored a round) we
  // still need pool_finish, step_after, and target_court_next set before
  // marking the session done — otherwise a same-day continuation would
  // anchor everyone to null and the next session's seeding falls back to
  // ranking-sheet sort, breaking one-up-one-down.
  // Only recompute if there are scored games AND any participant is missing
  // pool_finish; otherwise it's a session that ended without a round (rare,
  // but a no-op end shouldn't manufacture step movement out of zero data).
  const { data: missingFinish } = await auth.supabase
    .from("session_participants")
    .select("id")
    .eq("session_id", sessionId)
    .eq("checked_in", true)
    .is("pool_finish", null)
    .limit(1);

  if (missingFinish && missingFinish.length > 0) {
    const { count: scoredGames } = await auth.supabase
      .from("game_results")
      .select("id", { count: "exact", head: true })
      .eq("session_id", sessionId);

    if ((scoredGames ?? 0) > 0) {
      const r = await recomputeSessionStats(auth.supabase, sessionId);
      if (!r.ok) {
        return NextResponse.json({ error: r.error }, { status: 500 });
      }
    }
  }

  // Mark session complete
  const { error: updateErr } = await auth.supabase
    .from("shootout_sessions")
    .update({ status: "session_complete" })
    .eq("id", sessionId);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  // Recap is suppressed when called from Play Again — those players are
  // about to be re-seeded into the next session, so a "your session is
  // done" push is wrong.
  if (sendRecap) {
    sendRecapNotifications(auth.supabase, session, sessionId).catch((err) =>
      console.error("Session recap notifications failed:", err)
    );
  }

  return NextResponse.json({ status: "session_complete" });
}

async function sendRecapNotifications(
  supabase: any,
  session: any,
  sessionId: string
) {
  // Fetch participants with step data and pool finish
  const { data: participants } = await supabase
    .from("session_participants")
    .select("*, player:profiles(id, display_name)")
    .eq("session_id", sessionId)
    .eq("checked_in", true);

  if (!participants || participants.length === 0) return;

  // Fetch game results to compute per-player W/L for the session
  const { data: gameResults } = await supabase
    .from("game_results")
    .select("team_a_p1, team_a_p2, team_b_p1, team_b_p2, score_a, score_b")
    .eq("session_id", sessionId);

  const wlMap = new Map<string, { wins: number; losses: number }>();
  for (const p of participants) {
    wlMap.set(p.player_id, { wins: 0, losses: 0 });
  }
  for (const g of gameResults ?? []) {
    const teamA = [g.team_a_p1, g.team_a_p2].filter(Boolean) as string[];
    const teamB = [g.team_b_p1, g.team_b_p2].filter(Boolean) as string[];
    const aWon = g.score_a > g.score_b;
    for (const pid of teamA) {
      const s = wlMap.get(pid);
      if (s) { if (aWon) s.wins++; else s.losses++; }
    }
    for (const pid of teamB) {
      const s = wlMap.get(pid);
      if (s) { if (!aWon) s.wins++; else s.losses++; }
    }
  }

  const groupName = session.group?.name ?? "Session";
  const eventDate = session.sheet?.event_date ? formatDate(session.sheet.event_date) : null;

  const ordinal = (n: number) => {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };

  for (const p of participants) {
    const playerName = p.player?.display_name ?? "Player";
    const wl = wlMap.get(p.player_id) ?? { wins: 0, losses: 0 };
    const finish = p.pool_finish;
    const stepBefore = p.step_before;
    const stepAfter = p.step_after;
    const courtNumber = p.court_number;

    // End-of-session recap shows where they finished + their new step.
    // Court placement for the *next* session is intentionally omitted —
    // the next sheet's seeding is driven by step ranking, so promising
    // a specific court here would be misleading if turnout changes.
    const parts: string[] = [];
    if (finish != null && courtNumber != null) {
      parts.push(`Finished ${ordinal(finish)} on Court ${courtNumber}.`);
    }
    parts.push(`Record: ${wl.wins}W – ${wl.losses}L.`);
    if (stepBefore != null && stepAfter != null) {
      if (stepAfter !== stepBefore) {
        const dir = stepAfter < stepBefore ? "↑" : "↓";
        parts.push(`Step: ${stepBefore} → ${stepAfter} ${dir}`);
      } else {
        parts.push(`Step: ${stepAfter}`);
      }
    }

    const title = `${groupName} recap${eventDate ? ` — ${eventDate}` : ""}`;
    const body = parts.join(" ");

    notify({
      profileId: p.player_id,
      type: "session_recap",
      title,
      body,
      link: `/sessions/${sessionId}`,
      groupId: session.group_id,
      emailTemplate: "SessionRecap",
      emailData: {
        playerName,
        groupName,
        eventDate,
        courtNumber,
        finish,
        wins: wl.wins,
        losses: wl.losses,
        stepBefore,
        stepAfter,
        sessionId,
      },
    }).catch((err) =>
      console.error(`Recap notification failed for ${p.player_id}:`, err)
    );
  }
}
