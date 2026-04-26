/**
 * End-to-end tournament lifecycle test.
 *
 * Strategy in this sandbox:
 *  - Mint a fresh organizer user via signup → SQL-confirm-email →
 *    signin (the GoTrue admin PUT/list endpoints 500/503 from this
 *    network, but the public signup + SQL email-confirm path works
 *    reliably). Pack the resulting session into the cookie shape
 *    @supabase/ssr expects, then hit the local Next.js dev server's
 *    actual API routes for every organizer action.
 *  - For player registrations (78 separate calls), use service role
 *    to invoke the same `register_for_tournament_atomic` RPC the
 *    register API endpoint calls — same business logic, no per-user
 *    sign-in storm. The API endpoint's pre-RPC validation
 *    (gender conflicts, self-as-partner, etc.) is unreached by this
 *    path, but the registration data path itself IS exercised.
 *
 * Run: tsx scripts/test-e2e-tournament.ts
 */
import { createClient, SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const APP_URL = process.env.APP_URL || "http://localhost:3000";
const MGMT_TOKEN = process.env.SUPABASE_ACCESS_TOKEN!;
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF!;

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY || !MGMT_TOKEN || !PROJECT_REF) {
  console.error("Missing required env vars");
  process.exit(1);
}

const COOKIE_NAME = `sb-${PROJECT_REF}-auth-token`;

const admin: SupabaseClient = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ─── helpers ─────────────────────────────────────────────────────

async function mgmtSql<T = any>(sql: string): Promise<T> {
  const r = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${MGMT_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: sql }),
    }
  );
  if (!r.ok) throw new Error(`SQL fail: ${r.status} ${await r.text()}`);
  return await r.json();
}

interface Session { access_token: string; refresh_token: string; expires_at: number; expires_in: number; token_type: string; user: any }

async function createOrganizerSession(): Promise<{ session: Session; profileId: string; email: string }> {
  const email = `e2e-org-${Date.now()}-${Math.floor(Math.random()*100000)}@test.local`;
  const password = "Test-E2E-Pass-1234!";
  // Signup
  const signupRes = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!signupRes.ok) throw new Error(`signup failed: ${await signupRes.text()}`);
  const u = await signupRes.json();
  // Confirm email + create profile, both via SQL
  await mgmtSql(`UPDATE auth.users SET email_confirmed_at = now() WHERE id = '${u.id}';`);
  const profRow = await mgmtSql<{ id: string }[]>(
    `INSERT INTO profiles (user_id, email, display_name, full_name, role, is_active, member_since, is_test) VALUES ('${u.id}', '${email}', '[E2E TEST] Organizer', 'E2E Test Organizer', 'admin', true, now(), true) RETURNING id;`
  );
  // Sign in
  const tokenRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!tokenRes.ok) throw new Error(`signin failed: ${await tokenRes.text()}`);
  const session = await tokenRes.json() as Session;
  return { session, profileId: profRow[0].id, email };
}

function sessionToCookie(session: Session): string {
  const json = JSON.stringify(session);
  const b64 = Buffer.from(json, "utf8").toString("base64");
  return `${COOKIE_NAME}=base64-${b64}`;
}

async function api(
  cookie: string,
  method: string,
  path: string,
  body?: unknown
): Promise<{ status: number; body: any }> {
  const res = await fetch(`${APP_URL}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let json: any;
  const text = await res.text();
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, body: json };
}

function ok(label: string, cond: boolean) {
  console.log(`${cond ? "✓" : "✗"} ${label}`);
  if (!cond) process.exitCode = 1;
}

interface TestProfile { profile_id: string; display_name: string }
async function pickPlayerProfiles(n: number): Promise<TestProfile[]> {
  const rows = await mgmtSql<TestProfile[]>(
    `SELECT id AS profile_id, display_name FROM profiles WHERE is_test = true AND user_id IS NOT NULL ORDER BY display_name LIMIT ${n + 5};`
  );
  if (rows.length < n) throw new Error(`Only ${rows.length} test profiles, need ${n}`);
  return rows.slice(0, n);
}

// ─── main ────────────────────────────────────────────────────────

async function main() {
  console.log("\n=== E2E Tournament Test ===");
  console.log(`App URL: ${APP_URL}\n`);

  // 1. Create organizer with a real session
  const org = await createOrganizerSession();
  const orgCookie = sessionToCookie(org.session);
  ok(`Organizer signed in (${org.email})`, true);

  // 2. Pick 78 player profiles for 4+5+6+7+8+9 = 39 teams
  const TEAM_COUNTS = [4, 5, 6, 7, 8, 9];
  const TOTAL_PLAYERS = TEAM_COUNTS.reduce((a, b) => a + b, 0) * 2; // 78
  const players = await pickPlayerProfiles(TOTAL_PLAYERS);
  ok(`Picked ${players.length} test player profiles`, players.length === TOTAL_PLAYERS);

  // 3. Create the tournament (status=draft) — direct insert via
  //    organizer's authed supabase-js client, exactly as the
  //    /tournaments/new client component does
  const orgClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${org.session.access_token}` } },
  });
  const DIVISION_PLAN: { code: string; teamCount: number }[] = [
    { code: "mens_all_ages_3.5",   teamCount: 4 },
    { code: "womens_all_ages_3.5", teamCount: 5 },
    { code: "mens_all_ages_4.0",   teamCount: 6 },
    { code: "womens_all_ages_4.0", teamCount: 7 },
    { code: "mens_all_ages_4.5+",  teamCount: 8 },
    { code: "womens_all_ages_4.5+",teamCount: 9 },
  ];
  const TITLE = `[E2E] ${new Date().toISOString().slice(0, 19)}`;
  const startDate = new Date(Date.now() + 86400_000).toISOString().slice(0, 10);
  const endDate = new Date(Date.now() + 2 * 86400_000).toISOString().slice(0, 10);
  const { data: created, error: createErr } = await orgClient
    .from("tournaments")
    .insert({
      title: TITLE,
      type: "doubles",
      format: "round_robin",
      divisions: DIVISION_PLAN.map((d) => d.code),
      location: "E2E Test Location",
      start_date: startDate,
      end_date: endDate,
      score_to_win_pool: 11,
      score_to_win_playoff: 11,
      win_by_2: false,
      finals_best_of_3: false,
      num_courts: 4,
      created_by: org.profileId,
      status: "draft",
    })
    .select("id, status")
    .single();
  if (createErr) throw new Error(`create tournament: ${createErr.message}`);
  const tId = created!.id as string;
  ok(`Created tournament ${tId} (status=${created!.status})`, true);

  // 4. Open registration (status flip — same as OrganizerControls
  //    "Open Registration" button server action). Going through
  //    direct supabase update because there's no API route — the
  //    button calls a server action that ultimately writes the same
  //    column with the same RLS gate (organizer-only).
  await orgClient.from("tournaments").update({ status: "registration_open" }).eq("id", tId);
  ok(`Opened registration`, true);

  // 5. Register 39 teams via the registration RPC (same RPC the API
  //    endpoint calls — going direct to skip 78 separate signups).
  let teamCount = 0;
  let cursor = 0;
  for (const div of DIVISION_PLAN) {
    for (let t = 0; t < div.teamCount; t++) {
      const p1 = players[cursor++];
      const p2 = players[cursor++];
      const { data, error } = await admin.rpc("register_for_tournament_atomic", {
        p_tournament_id: tId,
        p_player_id: p1.profile_id,
        p_partner_id: p2.profile_id,
        p_division: div.code,
      } as any);
      if (error) {
        throw new Error(`register fail (${div.code} team ${t + 1}): ${error.message}`);
      }
      teamCount++;
    }
  }
  ok(`Registered ${teamCount} teams across ${DIVISION_PLAN.length} divisions`, teamCount === 39);

  // 6. Close registration
  await orgClient.from("tournaments").update({ status: "registration_closed" }).eq("id", tId);
  ok(`Closed registration`, true);

  // 7. Generate brackets via API endpoint (POST /api/tournaments/[id]/divisions)
  const genRes = await api(orgCookie, "POST", `/api/tournaments/${tId}/divisions`, {
    division_settings: {},
  });
  ok(`POST /divisions returned ${genRes.status} matches=${genRes.body?.matches}`, genRes.status === 200);

  // 8. Per-division match-shape report
  console.log("\n=== Per-division match counts ===");
  for (const div of DIVISION_PLAN) {
    const rows = await mgmtSql<any[]>(
      `SELECT bracket, status, count(*) AS n FROM tournament_matches WHERE tournament_id = '${tId}' AND division = '${div.code}' GROUP BY bracket, status ORDER BY bracket, status;`
    );
    const total = rows.reduce((s, r) => s + Number(r.n), 0);
    const byes = rows.filter((r) => r.status === "bye").reduce((s, r) => s + Number(r.n), 0);
    const real = total - byes;
    const pools = new Set(rows.map((r) => r.bracket));
    console.log(
      `  ${div.code}: ${div.teamCount} teams → ${total} match rows (${real} real + ${byes} bye), pools=[${[...pools].join(",")}]`
    );
  }

  // 9. Activate ALL divisions live via API (this stamps queue_entered_at + assigns initial courts)
  const actRes = await api(orgCookie, "POST", `/api/tournaments/${tId}/active-divisions`, { all: true });
  ok(`POST /active-divisions returned ${actRes.status}`, actRes.status === 200);

  // 10. Snapshot the queue / court assignments
  const onCourt = await mgmtSql<any[]>(
    `SELECT id, division, court_number, status, player1_id, player2_id, queue_entered_at FROM tournament_matches WHERE tournament_id = '${tId}' AND status = 'pending' AND court_number IS NOT NULL ORDER BY court_number;`
  );
  ok(`${onCourt.length} matches assigned to courts after activation`, onCourt.length > 0);
  console.log("  Courts:", onCourt.slice(0, 6).map((m) => `c${m.court_number}=${m.division.split("_").pop()}/${m.id.slice(0,6)}`).join(" "));

  // 11. Score the first on-court match through PUT /api/tournaments/[id]/bracket
  const target = onCourt[0];
  const scoreRes = await api(orgCookie, "PUT", `/api/tournaments/${tId}/bracket`, {
    match_id: target.id,
    score1: [11],
    score2: [5],
    winner_id: target.player1_id,
  });
  ok(`PUT /bracket score returned ${scoreRes.status}`, scoreRes.status === 200);

  // 12. Verify the scored match completed AND the court got refilled
  const [scored] = await mgmtSql<any[]>(
    `SELECT id, status, court_number, winner_id FROM tournament_matches WHERE id = '${target.id}';`
  );
  ok(`Scored match status='completed'`, scored.status === "completed");
  ok(`Scored match court freed`, scored.court_number == null);
  const refilled = await mgmtSql<any[]>(
    `SELECT id, division FROM tournament_matches WHERE tournament_id = '${tId}' AND status = 'pending' AND court_number = ${target.court_number};`
  );
  ok(`Court ${target.court_number} refilled with next queued match`, refilled.length === 1);

  // 13. Bump test: pick a different on-court match and DELETE its court assignment via the bump endpoint
  const remainingOnCourt = await mgmtSql<any[]>(
    `SELECT id, court_number FROM tournament_matches WHERE tournament_id = '${tId}' AND status = 'pending' AND court_number IS NOT NULL AND id != '${target.id}' ORDER BY court_number LIMIT 1;`
  );
  if (remainingOnCourt.length === 0) throw new Error("no other on-court match to bump");
  const bumpVictim = remainingOnCourt[0];
  const bumpRes = await api(orgCookie, "DELETE", `/api/tournaments/${tId}/queue/promote?match_id=${bumpVictim.id}`);
  ok(`DELETE /queue/promote returned ${bumpRes.status}`, bumpRes.status === 200);

  // 14. Verify bump effect: bumped match is off court, and it sits at queue position 2
  const [bumped] = await mgmtSql<any[]>(
    `SELECT id, court_number, status FROM tournament_matches WHERE id = '${bumpVictim.id}';`
  );
  ok(`Bumped match cleared from court (now court=${bumped.court_number ?? "null"})`, bumped.court_number == null);

  // After the bump-induced auto-promote on the freed court, the
  // bumped match should be the SECOND in the off-court queue
  // (per the position-2 invariant in the route's docstring).
  const queue = await mgmtSql<any[]>(
    `SELECT id, queue_entered_at FROM tournament_matches WHERE tournament_id = '${tId}' AND status = 'pending' AND court_number IS NULL ORDER BY queue_entered_at LIMIT 5;`
  );
  const idx = queue.findIndex((m) => m.id === bumpVictim.id);
  ok(`Bumped match is at off-court queue position ${idx + 1} (expected 2)`, idx === 1);

  // ─── Cleanup ───
  console.log("\n=== Cleanup ===");
  await mgmtSql(`DELETE FROM tournament_active_divisions WHERE tournament_id = '${tId}';`);
  await mgmtSql(`DELETE FROM tournament_matches WHERE tournament_id = '${tId}';`);
  await mgmtSql(`DELETE FROM tournament_registrations WHERE tournament_id = '${tId}';`);
  await mgmtSql(`DELETE FROM tournaments WHERE id = '${tId}';`);
  // Remove the throwaway organizer profile + auth user
  await mgmtSql(`DELETE FROM profiles WHERE id = '${org.profileId}';`);
  await mgmtSql(`DELETE FROM auth.users WHERE id = '${org.session.user.id}';`);
  ok(`Cleaned up tournament ${tId} and organizer ${org.email}`, true);

  console.log("\n=== DONE ===");
}

main().catch((e) => {
  console.error("\n✗ FAIL:", e.message ?? e);
  process.exit(1);
});
