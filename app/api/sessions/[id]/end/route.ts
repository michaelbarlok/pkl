import { requireAuth, isGroupAdmin } from "@/lib/auth";
import { notify } from "@/lib/notify";
import { NextRequest, NextResponse } from "next/server";
import { formatDate } from "@/lib/utils";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const { id: sessionId } = await params;

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

  // Mark session complete
  const { error: updateErr } = await auth.supabase
    .from("shootout_sessions")
    .update({ status: "session_complete" })
    .eq("id", sessionId);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  // Fetch participants with their stats for the recap (non-blocking after this point)
  sendRecapNotifications(auth.supabase, session, sessionId).catch((err) =>
    console.error("Session recap notifications failed:", err)
  );

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
  const isCourtPromotion = session.group?.ladder_type === "court_promotion";

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
    const targetCourtNext = p.target_court_next;

    const parts: string[] = [];
    if (finish != null && courtNumber != null) {
      parts.push(`Finished ${ordinal(finish)} on Court ${courtNumber}.`);
    }
    parts.push(`Record: ${wl.wins}W – ${wl.losses}L.`);
    if (stepBefore != null && stepAfter != null && stepAfter !== stepBefore) {
      const dir = stepAfter < stepBefore ? "↑" : "↓";
      parts.push(`Step: ${stepBefore} → ${stepAfter} ${dir}`);
    }
    if (isCourtPromotion && targetCourtNext != null && courtNumber != null) {
      if (targetCourtNext < courtNumber) parts.push(`Next session: Court ${targetCourtNext} ↑`);
      else if (targetCourtNext > courtNumber) parts.push(`Next session: Court ${targetCourtNext} ↓`);
      else parts.push(`Next session: Court ${targetCourtNext} →`);
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
        targetCourtNext,
        isCourtPromotion,
        sessionId,
      },
    }).catch((err) =>
      console.error(`Recap notification failed for ${p.player_id}:`, err)
    );
  }
}
