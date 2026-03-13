import { createClient, createServiceClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

const FIRST_NAMES = [
  "Alex", "Jordan", "Taylor", "Casey", "Morgan", "Riley", "Quinn", "Avery",
  "Cameron", "Drew", "Finley", "Harper", "Hayden", "Jesse", "Kai", "Lane",
  "Micah", "Noel", "Parker", "Peyton", "Reese", "River", "Rowan", "Sage",
  "Skyler", "Blake", "Charlie", "Dakota", "Emerson", "Frankie", "Gray",
  "Harley", "Jaden", "Kendall", "Logan", "Mackenzie", "Oakley", "Phoenix", "Spencer",
];

const LAST_NAMES = [
  "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis",
  "Rodriguez", "Martinez", "Anderson", "Thomas", "Jackson", "White", "Harris",
  "Martin", "Thompson", "Moore", "Young", "Allen", "King", "Wright", "Scott",
  "Torres", "Hill", "Green", "Adams", "Baker", "Nelson", "Carter", "Mitchell",
  "Perez", "Roberts", "Turner", "Phillips", "Campbell", "Parker", "Evans", "Edwards",
];

export async function POST(request: Request) {
  const url = new URL(request.url);
  const querySheetId = url.searchParams.get("sheetId");
  const body = await request.json().catch(() => ({}));
  const sheetId = querySheetId || body.sheetId;
  const supabase = await createClient();

  // Verify admin
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("user_id", user.id)
    .single();

  if (!profile || profile.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Use service client for data mutations (bypasses RLS)
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY is not configured" }, { status: 500 });
  }
  const serviceClient = await createServiceClient();

  // Find the sheet — use provided sheetId or fall back to first open sheet
  let sheet: { id: string; player_limit: number; group_id: string } | null = null;

  if (sheetId) {
    const { data } = await serviceClient
      .from("signup_sheets")
      .select("id, player_limit, group_id")
      .eq("id", sheetId)
      .single();
    sheet = data;
  } else {
    const { data } = await serviceClient
      .from("signup_sheets")
      .select("id, player_limit, group_id")
      .eq("status", "open")
      .order("event_date", { ascending: true })
      .limit(1)
      .single();
    sheet = data;
  }

  if (!sheet) {
    // Debug: list all sheets to understand why lookup failed
    const { data: allSheets, error: debugErr } = await serviceClient
      .from("signup_sheets")
      .select("id, status, player_limit, group_id")
      .limit(5);
    return NextResponse.json({
      error: "Sheet not found",
      version: "v4",
      sheetIdUsed: sheetId || null,
      debug: { allSheets, debugErr: debugErr?.message },
    }, { status: 404 });
  }

  // Create 39 test profiles
  const testProfiles: {
    user_id: string;
    full_name: string;
    display_name: string;
    email: string;
    role: "player";
    is_active: boolean;
    member_since: string;
    preferred_notify: string[];
    _step: number;
    _pct: number;
  }[] = [];
  for (let i = 0; i < 39; i++) {
    const firstName = FIRST_NAMES[i];
    const lastName = LAST_NAMES[i];
    const displayName = `${firstName} ${lastName}`;
    const step = Math.floor(Math.random() * 6) + 1; // 1-6
    const pct = Math.round((Math.random() * 40 + 50) * 10) / 10; // 50-90%

    testProfiles.push({
      user_id: crypto.randomUUID(),
      full_name: displayName,
      display_name: `[TEST] ${displayName}`,
      email: `test-${firstName.toLowerCase()}-${lastName.toLowerCase()}@test.local`,
      role: "player" as const,
      is_active: true,
      member_since: new Date().toISOString(),
      preferred_notify: ["email"],
      _step: step,
      _pct: pct,
    });
  }

  // Insert profiles (without _step and _pct)
  const profileInserts = testProfiles.map(({ _step, _pct, ...rest }) => rest);
  const { data: inserted, error: insertErr } = await serviceClient
    .from("profiles")
    .insert(profileInserts)
    .select("id");

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  if (!inserted || inserted.length === 0) {
    return NextResponse.json({ error: "No profiles created" }, { status: 500 });
  }

  // Create group memberships with random steps and percentages
  const memberships = inserted.map((p, i) => ({
    player_id: p.id,
    group_id: sheet.group_id,
    current_step: testProfiles[i]._step,
    win_pct: testProfiles[i]._pct,
    total_sessions: Math.floor(Math.random() * 20) + 1,
    last_played_at: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(),
  }));

  const { error: memberErr } = await serviceClient
    .from("group_memberships")
    .insert(memberships);

  if (memberErr) {
    console.error("Membership insert error:", memberErr);
  }

  // Count existing confirmed registrations
  const { count: existingConfirmed } = await serviceClient
    .from("registrations")
    .select("id", { count: "exact", head: true })
    .eq("sheet_id", sheet.id)
    .eq("status", "confirmed");

  const spotsLeft = sheet.player_limit - (existingConfirmed ?? 0);

  // Register all test users on the sheet
  const registrations = inserted.map((p, i) => {
    const isConfirmed = i < spotsLeft;
    return {
      sheet_id: sheet.id,
      player_id: p.id,
      status: isConfirmed ? "confirmed" : "waitlist",
      waitlist_position: isConfirmed ? null : i - spotsLeft + 1,
      registered_by: profile.id,
    };
  });

  const { error: regErr } = await serviceClient
    .from("registrations")
    .insert(registrations);

  if (regErr) {
    return NextResponse.json({ error: regErr.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    created: inserted.length,
    sheetId: sheet.id,
    confirmed: Math.min(inserted.length, spotsLeft),
    waitlisted: Math.max(0, inserted.length - spotsLeft),
  });
}
