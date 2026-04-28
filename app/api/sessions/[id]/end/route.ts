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

  // If a round is in progress, every expected game has to be scored
  // before we'll let the session be finalized. Same rule complete-round
  // already enforces — having it here too means no path (Play Again,
  // End Session, or a direct API call) can advance past round_active
  // with partial or zero scores, which is what produced null targets
  // and the rank-sort fallback in Athens earlier this week.
  if (session.status === "round_active") {
    const { data: checkedInParts } = await auth.supabase
      .from("session_participants")
      .select("court_number")
      .eq("session_id", sessionId)
      .eq("checked_in", true)
      .not("court_number", "is", null);

    const courtSizes = new Map<number, number>();
    for (const p of checkedInParts ?? []) {
      const c = p.court_number as number;
      courtSizes.set(c, (courtSizes.get(c) ?? 0) + 1);
    }

    if (courtSizes.size > 0) {
      const { data: gameResults } = await auth.supabase
        .from("game_results")
        .select("pool_number")
        .eq("session_id", sessionId)
        .eq("round_number", session.current_round || 1);

      const gameCounts = new Map<number, number>();
      for (const g of gameResults ?? []) {
        gameCounts.set(g.pool_number, (gameCounts.get(g.pool_number) ?? 0) + 1);
      }

      const incomplete: string[] = [];
      for (const [courtNum, size] of courtSizes) {
        const expected = size === 5 ? 5 : 3;
        const got = gameCounts.get(courtNum) ?? 0;
        if (got < expected) {
          incomplete.push(`Court ${courtNum} (${got}/${expected})`);
        }
      }

      if (incomplete.length > 0) {
        return NextResponse.json(
          {
            error: `Score every game before ending the session — incomplete: ${incomplete.join(", ")}.`,
          },
          { status: 400 }
        );
      }
    }
  }

  // If admin skipped Complete Round (or scored everything but never
  // clicked it), pool_finish / step_after / target_court_next still
  // need to be set before the session is marked done — otherwise a
  // same-day continuation anchors everyone to null. The check above
  // already guarantees scores are complete in round_active; this
  // recompute fills in the derived fields. Idempotent if recompute
  // already ran via complete-round.
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
