/**
 * Concurrent signup stress test for ladder league sign-up sheets.
 *
 * Fires 40-50 simultaneous calls at the atomic signup RPC and verifies the
 * final sheet state is internally consistent (no over-confirming, no gaps or
 * duplicates in the waitlist, admins pinned, low-priority at the back).
 *
 * Creates an isolated PRIVATE group + hidden sheet owned by test users only.
 * Nothing is user-visible. Everything is deleted at the end.
 *
 * Phase 1 (always runs): 50 parallel RPC calls via PostgREST with per-user JWTs.
 *   Exercises Supabase auth, PostgREST transport, and the row-locking RPC.
 * Phase 2 (opt-in with --http <url>): 50 parallel POST /api/sheets/[id]/signup
 *   with cookie auth, exercising the full Next.js API route.
 *
 * Usage:
 *   npx tsx scripts/concurrent-signup-test.ts
 *   PLAYER_COUNT=50 PLAYER_LIMIT=16 npx tsx scripts/concurrent-signup-test.ts
 *   npx tsx scripts/concurrent-signup-test.ts --http http://localhost:3000
 *
 * Env:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY
 *   SUPABASE_SERVICE_ROLE_KEY
 *   PLAYER_COUNT     (default 50)
 *   PLAYER_LIMIT     (default 16)
 *   TEST_PASSWORD    (default "testpassword123")
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
try { require("dotenv").config({ path: ".env.local" }); } catch { /* dotenv optional */ }

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PLAYER_COUNT = parseInt(process.env.PLAYER_COUNT || "50", 10);
const PLAYER_LIMIT = parseInt(process.env.PLAYER_LIMIT || "16", 10);
const TEST_PASSWORD = process.env.TEST_PASSWORD || "testpassword123";

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) {
  console.error("Missing required env: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const httpArgIdx = process.argv.indexOf("--http");
const HTTP_TARGET = httpArgIdx >= 0 ? process.argv[httpArgIdx + 1] : null;

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

type TestUser = {
  profile_id: string;
  user_id: string;
  email: string;
  full_name: string;
  priority: "high" | "normal" | "low";
  role: "admin" | "member";
};

type RpcResponse = {
  status?: string;
  id?: string;
  waitlist_position?: number | null;
  bumped_player_id?: string | null;
  already_registered?: boolean;
  error?: string;
};

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return sorted[idx];
}

function banner(label: string) {
  console.log(`\n${"=".repeat(70)}\n${label}\n${"=".repeat(70)}`);
}

async function setup(): Promise<{ groupId: string; sheetId: string; users: TestUser[] }> {
  banner(`SETUP — ${PLAYER_COUNT} test users, limit ${PLAYER_LIMIT}`);

  // Pick PLAYER_COUNT test users alphabetically (deterministic set across runs)
  const { data: profiles, error: profErr } = await admin
    .from("profiles")
    .select("id, user_id, email, full_name")
    .eq("is_test", true)
    .order("full_name", { ascending: true })
    .limit(PLAYER_COUNT);

  if (profErr) throw profErr;
  if (!profiles || profiles.length < PLAYER_COUNT) {
    throw new Error(`Only ${profiles?.length ?? 0} test users available; need ${PLAYER_COUNT}`);
  }

  const users: TestUser[] = profiles.map((p, i) => ({
    profile_id: p.id,
    user_id: p.user_id,
    email: p.email,
    full_name: p.full_name,
    priority: i < 3 ? "high" : i >= PLAYER_COUNT - 2 ? "low" : "normal",
    role: i < 3 ? "admin" : "member",
  }));

  // Private group, not discoverable by real users
  const slug = `e2e-concurrency-${Date.now()}`;
  const { data: group, error: groupErr } = await admin
    .from("shootout_groups")
    .insert({
      name: "[E2E-CONCURRENCY] Hidden",
      slug,
      description: "Automated concurrency test — auto-deleted",
      group_type: "ladder_league",
      ladder_type: "court_promotion",
      created_by: users[0].profile_id,
      is_active: true,
      visibility: "private",
    })
    .select("id")
    .single();
  if (groupErr) throw groupErr;
  const groupId = group.id as string;

  const memberships = users.map((u) => ({
    group_id: groupId,
    player_id: u.profile_id,
    current_step: 1,
    group_role: u.role,
    signup_priority: u.priority,
  }));
  const { error: memErr } = await admin.from("group_memberships").insert(memberships);
  if (memErr) throw memErr;

  // Sheet: event 30 days out, signup closes in 7 days, no creation notifications
  const eventDate = new Date();
  eventDate.setDate(eventDate.getDate() + 30);
  const eventDateStr = eventDate.toISOString().split("T")[0];
  const closesAt = new Date(Date.now() + 7 * 86400_000).toISOString();

  const { data: sheet, error: sheetErr } = await admin
    .from("signup_sheets")
    .insert({
      group_id: groupId,
      event_date: eventDateStr,
      event_time: `${eventDateStr}T20:00:00+00`,
      location: "E2E Concurrency Test",
      player_limit: PLAYER_LIMIT,
      signup_closes_at: closesAt,
      allow_member_guests: false,
      notify_on_create: false,
      status: "open",
      created_by: users[0].profile_id,
    })
    .select("id")
    .single();
  if (sheetErr) throw sheetErr;
  const sheetId = sheet.id as string;

  console.log(`Group: ${groupId}`);
  console.log(`Sheet: ${sheetId}`);
  console.log(`Admins (high): ${users.slice(0, 3).map((u) => u.full_name).join(", ")}`);
  console.log(`Low priority: ${users.slice(-2).map((u) => u.full_name).join(", ")}`);

  return { groupId, sheetId, users };
}

async function cleanup(groupId: string, sheetId: string): Promise<void> {
  banner("CLEANUP");
  await admin.from("notifications").delete().eq("group_id", groupId);
  await admin.from("registrations").delete().eq("sheet_id", sheetId);
  await admin.from("signup_sheets").delete().eq("id", sheetId);
  await admin.from("group_memberships").delete().eq("group_id", groupId);
  await admin.from("shootout_groups").delete().eq("id", groupId);
  console.log("Deleted group, sheet, memberships, registrations, notifications.");
}

async function authenticateAll(users: TestUser[]): Promise<Map<string, string>> {
  console.log(`\nAuthenticating ${users.length} test users (sequential — setup only)...`);
  const tokens = new Map<string, string>();
  for (const u of users) {
    const c = createClient(SUPABASE_URL!, ANON_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await c.auth.signInWithPassword({
      email: u.email,
      password: TEST_PASSWORD,
    });
    if (error || !data.session) {
      throw new Error(`Sign-in failed for ${u.email}: ${error?.message ?? "no session"}`);
    }
    tokens.set(u.profile_id, data.session.access_token);
  }
  console.log(`Got ${tokens.size} JWTs.`);
  return tokens;
}

async function resetRegistrations(sheetId: string): Promise<void> {
  await admin.from("registrations").delete().eq("sheet_id", sheetId);
}

async function phase1RpcConcurrency(
  sheetId: string,
  users: TestUser[],
  tokens: Map<string, string>
): Promise<boolean> {
  banner("PHASE 1 — Concurrent RPC calls via PostgREST (per-user JWT)");
  await resetRegistrations(sheetId);

  // One supabase client per user, authenticated with their JWT. Clients share
  // the underlying HTTP agent in Node 18+ fetch, which is what a real fleet of
  // 50 browsers would do (separate TLS sessions, shared Supabase infra).
  const userClients: SupabaseClient[] = users.map((u) => {
    const token = tokens.get(u.profile_id)!;
    return createClient(SUPABASE_URL!, ANON_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
  });

  // Pre-build all 50 promises synchronously, then await Promise.all — this
  // releases them into the event loop together, maximizing simultaneity.
  const t0 = Date.now();
  const deferredCalls = users.map((u, i) =>
    (async () => {
      const startedAt = Date.now();
      const { data, error } = await userClients[i].rpc("safe_signup_for_sheet", {
        p_sheet_id: sheetId,
        p_player_id: u.profile_id,
        p_priority: u.priority,
      });
      return {
        idx: i,
        player: u.full_name,
        priority: u.priority,
        latencyMs: Date.now() - startedAt,
        error: error?.message,
        result: data as RpcResponse | null,
      };
    })()
  );
  const results = await Promise.all(deferredCalls);
  const totalMs = Date.now() - t0;

  const latencies = results.map((r) => r.latencyMs).sort((a, b) => a - b);
  const errors = results.filter((r) => r.error || r.result?.error);
  console.log(`Fired ${results.length} RPC calls in ${totalMs}ms wall-time.`);
  console.log(
    `Latency p50=${percentile(latencies, 0.5)}ms  p95=${percentile(latencies, 0.95)}ms  ` +
      `p99=${percentile(latencies, 0.99)}ms  max=${latencies[latencies.length - 1]}ms`
  );
  if (errors.length) {
    console.log(`\nErrors (${errors.length}):`);
    for (const e of errors.slice(0, 10)) {
      console.log(`  ${e.player}: ${e.error ?? e.result?.error}`);
    }
  }

  return verifyFinalState(sheetId, users, "Phase 1");
}

/**
 * Cookie formatter for @supabase/ssr.
 * Cookie name: sb-<project-ref>-auth-token
 * Cookie value: "base64-" + base64url(JSON(session))
 * Session value is the shape returned by supabase.auth.getSession().data.session.
 */
function buildSupabaseAuthCookie(
  url: string,
  session: { access_token: string; refresh_token: string; user: unknown }
): { name: string; value: string } {
  const projectRef = new URL(url).host.split(".")[0];
  const body = {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: "bearer",
    user: session.user,
  };
  const json = JSON.stringify(body);
  const b64 = Buffer.from(json, "utf8").toString("base64");
  return { name: `sb-${projectRef}-auth-token`, value: `base64-${b64}` };
}

async function phase2HttpConcurrency(
  sheetId: string,
  users: TestUser[],
  baseUrl: string
): Promise<boolean> {
  banner(`PHASE 2 — Concurrent HTTP POSTs to ${baseUrl}/api/sheets/[id]/signup`);
  await resetRegistrations(sheetId);

  // Sign in each user and build their auth cookie
  console.log(`Building auth cookies for ${users.length} users...`);
  const cookies: string[] = [];
  for (const u of users) {
    const c = createClient(SUPABASE_URL!, ANON_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await c.auth.signInWithPassword({
      email: u.email,
      password: TEST_PASSWORD,
    });
    if (error || !data.session) {
      throw new Error(`Sign-in failed for ${u.email}: ${error?.message ?? "no session"}`);
    }
    const ck = buildSupabaseAuthCookie(SUPABASE_URL!, {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      user: data.user,
    });
    cookies.push(`${ck.name}=${ck.value}`);
  }

  const t0 = Date.now();
  const deferred = users.map((u, i) =>
    (async () => {
      const startedAt = Date.now();
      try {
        const res = await fetch(`${baseUrl}/api/sheets/${sheetId}/signup`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: cookies[i],
          },
          body: JSON.stringify({}),
        });
        const body = await res.json().catch(() => ({}));
        return {
          idx: i,
          player: u.full_name,
          status: res.status,
          latencyMs: Date.now() - startedAt,
          body,
        };
      } catch (err) {
        return {
          idx: i,
          player: u.full_name,
          status: -1,
          latencyMs: Date.now() - startedAt,
          body: { error: err instanceof Error ? err.message : String(err) },
        };
      }
    })()
  );
  const results = await Promise.all(deferred);
  const totalMs = Date.now() - t0;

  const latencies = results.map((r) => r.latencyMs).sort((a, b) => a - b);
  const oks = results.filter((r) => r.status === 200);
  const errs = results.filter((r) => r.status !== 200);
  console.log(`Fired ${results.length} HTTP POSTs in ${totalMs}ms wall-time.`);
  console.log(
    `Latency p50=${percentile(latencies, 0.5)}ms  p95=${percentile(latencies, 0.95)}ms  ` +
      `p99=${percentile(latencies, 0.99)}ms  max=${latencies[latencies.length - 1]}ms`
  );
  console.log(`OK: ${oks.length}/${results.length}`);
  if (errs.length) {
    console.log(`Errors (${errs.length}):`);
    for (const e of errs.slice(0, 10)) console.log(`  ${e.player}: ${e.status} ${JSON.stringify(e.body)}`);
  }

  return verifyFinalState(sheetId, users, "Phase 2");
}

async function verifyFinalState(
  sheetId: string,
  users: TestUser[],
  label: string
): Promise<boolean> {
  console.log(`\nVerifying final state (${label})...`);

  const { data: regs, error: rErr } = await admin
    .from("registrations")
    .select("player_id, status, priority, waitlist_position, signed_up_at")
    .eq("sheet_id", sheetId);
  if (rErr) throw rErr;

  const confirmed = (regs ?? []).filter((r) => r.status === "confirmed");
  const waitlisted = (regs ?? []).filter((r) => r.status === "waitlist");
  const byPlayer = new Map((regs ?? []).map((r) => [r.player_id, r]));

  const waitlistPositions = waitlisted
    .map((r) => r.waitlist_position as number)
    .sort((a, b) => a - b);
  const positionsContiguous =
    waitlistPositions.length === waitlisted.length &&
    waitlistPositions.every((p, i) => p === i + 1);

  const highCount = users.filter((u) => u.priority === "high").length;
  const allHighConfirmed = users
    .filter((u) => u.priority === "high")
    .every((u) => byPlayer.get(u.profile_id)?.status === "confirmed");

  const lowOnWaitlist = users
    .filter((u) => u.priority === "low")
    .every((u) => byPlayer.get(u.profile_id)?.status === "waitlist");

  const checks: Array<[string, boolean]> = [
    [`registrations total = ${users.length}`, (regs ?? []).length === users.length],
    [`confirmed = ${PLAYER_LIMIT}`, confirmed.length === PLAYER_LIMIT],
    [
      `waitlist = ${users.length - PLAYER_LIMIT}`,
      waitlisted.length === users.length - PLAYER_LIMIT,
    ],
    [`no duplicate registrations (one per player)`, byPlayer.size === users.length],
    [`waitlist positions 1..${waitlisted.length} contiguous, no gaps/dups`, positionsContiguous],
    [`all ${highCount} admins (high) confirmed`, allHighConfirmed],
    [
      `all low-priority on waitlist (sheet is over capacity)`,
      users.length > PLAYER_LIMIT ? lowOnWaitlist : true,
    ],
  ];

  let allPass = true;
  for (const [label, pass] of checks) {
    console.log(`${pass ? "✓ PASS" : "✗ FAIL"}: ${label}`);
    if (!pass) allPass = false;
  }
  return allPass;
}

async function main(): Promise<void> {
  const { groupId, sheetId, users } = await setup();
  let failed = false;
  try {
    const tokens = await authenticateAll(users);
    const phase1Pass = await phase1RpcConcurrency(sheetId, users, tokens);
    if (!phase1Pass) failed = true;

    if (HTTP_TARGET) {
      const phase2Pass = await phase2HttpConcurrency(sheetId, users, HTTP_TARGET);
      if (!phase2Pass) failed = true;
    } else {
      console.log(`\n(Phase 2 skipped — pass --http <base-url> to run full HTTP test.)`);
    }
  } finally {
    await cleanup(groupId, sheetId);
  }

  banner(failed ? "RESULT: FAIL" : "RESULT: PASS");
  process.exit(failed ? 1 : 0);
}

main().catch(async (err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
