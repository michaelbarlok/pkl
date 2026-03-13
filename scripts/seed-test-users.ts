/**
 * Seed 39 test users into the first open signup sheet.
 * Run: npx tsx scripts/seed-test-users.ts
 * Clean up: npx tsx scripts/seed-test-users.ts --delete
 *
 * Requires .env.local with NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
 * If dotenv isn't installed, pass env vars inline:
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/seed-test-users.ts
 */

import { createClient } from "@supabase/supabase-js";
try { require("dotenv").config({ path: ".env.local" }); } catch { /* dotenv not installed */ }

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

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

async function deleteTestUsers() {
  console.log("Deleting test users...");

  const { data: testProfiles } = await supabase
    .from("profiles")
    .select("id")
    .like("display_name", "[TEST]%");

  if (!testProfiles || testProfiles.length === 0) {
    console.log("No test users found.");
    return;
  }

  const ids = testProfiles.map((p) => p.id);

  await supabase.from("registrations").delete().in("player_id", ids);
  await supabase.from("group_memberships").delete().in("player_id", ids);
  const { error } = await supabase.from("profiles").delete().in("id", ids);

  if (error) {
    console.error("Error deleting:", error.message);
  } else {
    console.log(`Deleted ${ids.length} test users.`);
  }
}

async function seedTestUsers() {
  // Find the first open sheet
  const { data: sheet, error: sheetErr } = await supabase
    .from("signup_sheets")
    .select("id, player_limit, group_id")
    .eq("status", "open")
    .order("event_date", { ascending: true })
    .limit(1)
    .single();

  if (sheetErr || !sheet) {
    console.error("No open sheet found:", sheetErr?.message);
    return;
  }

  console.log(`Found open sheet: ${sheet.id} (limit: ${sheet.player_limit})`);

  // Build 39 test profiles
  const profiles = [];
  const metadata: { step: number; pct: number }[] = [];

  for (let i = 0; i < 39; i++) {
    const firstName = FIRST_NAMES[i];
    const lastName = LAST_NAMES[i];
    const step = Math.floor(Math.random() * 6) + 1;
    const pct = Math.round((Math.random() * 40 + 50) * 10) / 10;

    profiles.push({
      user_id: crypto.randomUUID(),
      full_name: `${firstName} ${lastName}`,
      display_name: `[TEST] ${firstName} ${lastName}`,
      email: `test-${firstName.toLowerCase()}-${lastName.toLowerCase()}@test.local`,
      role: "player",
      is_active: true,
      member_since: new Date().toISOString(),
      preferred_notify: ["email"],
    });
    metadata.push({ step, pct });
  }

  // Insert profiles
  const { data: inserted, error: insertErr } = await supabase
    .from("profiles")
    .insert(profiles)
    .select("id");

  if (insertErr || !inserted) {
    console.error("Error inserting profiles:", insertErr?.message);
    return;
  }

  console.log(`Created ${inserted.length} test profiles.`);

  // Create group memberships
  const memberships = inserted.map((p, i) => ({
    player_id: p.id,
    group_id: sheet.group_id,
    current_step: metadata[i].step,
    win_pct: metadata[i].pct,
    total_sessions: Math.floor(Math.random() * 20) + 1,
    last_played_at: new Date(Date.now() - Math.random() * 30 * 86400000).toISOString(),
  }));

  const { error: memberErr } = await supabase.from("group_memberships").insert(memberships);
  if (memberErr) console.error("Membership error:", memberErr.message);
  else console.log("Created group memberships.");

  // Count existing confirmed
  const { count: existingConfirmed } = await supabase
    .from("registrations")
    .select("id", { count: "exact", head: true })
    .eq("sheet_id", sheet.id)
    .eq("status", "confirmed");

  const spotsLeft = sheet.player_limit - (existingConfirmed ?? 0);

  // Register on the sheet
  const registrations = inserted.map((p, i) => {
    const isConfirmed = i < spotsLeft;
    return {
      sheet_id: sheet.id,
      player_id: p.id,
      status: isConfirmed ? "confirmed" : "waitlist",
      waitlist_position: isConfirmed ? null : i - spotsLeft + 1,
    };
  });

  const { error: regErr } = await supabase.from("registrations").insert(registrations);
  if (regErr) {
    console.error("Registration error:", regErr.message);
  } else {
    const confirmed = Math.min(inserted.length, spotsLeft);
    const waitlisted = Math.max(0, inserted.length - spotsLeft);
    console.log(`Registered all on sheet: ${confirmed} confirmed, ${waitlisted} waitlisted.`);
  }

  console.log("Done!");
}

// Main
const isDelete = process.argv.includes("--delete");
if (isDelete) {
  deleteTestUsers();
} else {
  seedTestUsers();
}
