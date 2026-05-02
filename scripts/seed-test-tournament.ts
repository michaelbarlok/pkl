/**
 * Seed a private[ish] test tournament with 60 doubles teams across the
 * 12 All Ages divisions (no Senior divisions). Uses test-only profiles
 * (display_name prefixed with [TEST], is_test=true) so the regular
 * member directory and admin pickers stay clean.
 *
 * Run: npx tsx scripts/seed-test-tournament.ts
 * Wipe: npx tsx scripts/seed-test-tournament.ts --delete
 *
 * Distribution: 20 mens teams + 20 womens teams + 20 mixed teams,
 * spread across 4 divisions in each gender bucket with floor 3 per
 * division (so every division can generate a bracket). The remaining
 * 8 per bucket are random. Each test profile is used exactly once,
 * 120 profiles total (60 male + 60 female).
 *
 * Tournament is created as the first site admin, status flipped to
 * `registration_closed` so the organizer can immediately hit Generate
 * Brackets. Title prefixed with [TEST] for clear identification.
 */
import { createClient } from "@supabase/supabase-js";
try { require("dotenv").config({ path: ".env.local" }); } catch { /* dotenv optional */ }

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const MGMT_TOKEN = process.env.SUPABASE_ACCESS_TOKEN!;
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF!;

if (!SUPABASE_URL || !SERVICE_KEY || !MGMT_TOKEN || !PROJECT_REF) {
  console.error(
    "Missing one of: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ACCESS_TOKEN, SUPABASE_PROJECT_REF"
  );
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function mgmtSql<T = any>(sql: string): Promise<T> {
  const r = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${MGMT_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sql }),
    }
  );
  if (!r.ok) throw new Error(`SQL fail (${r.status}): ${await r.text()}`);
  return await r.json();
}

const TOURNAMENT_TITLE_PREFIX = "[TEST] Round Robin Doubles";

const MENS_DIVS = [
  "mens_all_ages_3.0",
  "mens_all_ages_3.5",
  "mens_all_ages_4.0",
  "mens_all_ages_4.5+",
];
const WOMENS_DIVS = [
  "womens_all_ages_3.0",
  "womens_all_ages_3.5",
  "womens_all_ages_4.0",
  "womens_all_ages_4.5+",
];
const MIXED_DIVS = [
  "mixed_all_ages_3.0",
  "mixed_all_ages_3.5",
  "mixed_all_ages_4.0",
  "mixed_all_ages_4.5+",
];
const ALL_DIVS = [...MENS_DIVS, ...WOMENS_DIVS, ...MIXED_DIVS];

const MALE_FIRSTS = [
  "Aiden", "Brendan", "Caleb", "Daniel", "Ethan", "Felix", "Gabe", "Hunter",
  "Ian", "Jared", "Kyle", "Logan", "Mason", "Nolan", "Owen", "Patrick",
  "Quentin", "Ryan", "Sean", "Travis", "Ulysses", "Vincent", "Wyatt", "Xavier",
  "Yusuf", "Zane", "Adam", "Bryce", "Carter", "Derek", "Evan", "Frank",
  "Greg", "Henry", "Isaac", "Jackson", "Kevin", "Liam", "Marco", "Nate",
  "Oliver", "Peter", "Quincy", "Rafael", "Steve", "Tyler", "Victor", "Walter",
  "Yale", "Zach", "Aaron", "Beck", "Cole", "Dean", "Eli", "Fred",
  "Gus", "Hank", "Ivan", "Jake",
];
const FEMALE_FIRSTS = [
  "Alice", "Brooke", "Chloe", "Daisy", "Emma", "Fiona", "Grace", "Hannah",
  "Iris", "Julia", "Kara", "Lila", "Maya", "Nina", "Olivia", "Paige",
  "Quinn", "Ruby", "Sophie", "Tara", "Uma", "Vera", "Willow", "Ximena",
  "Yara", "Zoe", "Ava", "Bella", "Cara", "Dana", "Ella", "Faye",
  "Gemma", "Holly", "Ivy", "Jade", "Kate", "Luna", "Mira", "Nora",
  "Opal", "Piper", "Quincy", "Rose", "Sara", "Tess", "Una", "Violet",
  "Wendy", "Yuki", "Zara", "Amber", "Beth", "Cleo", "Dawn", "Eve",
  "Faith", "Gigi", "Hope", "Iva",
];
const LASTS = [
  "Walker", "Brooks", "Chen", "Diaz", "Evans", "Foster", "Garcia", "Hayes",
  "Ito", "Jensen", "Khan", "Lopez", "Murphy", "Nguyen", "Ortiz", "Patel",
  "Quinn", "Rivera", "Singh", "Taylor", "Underwood", "Vargas", "Wong", "Xu",
  "Young", "Zhao", "Adler", "Bennett", "Cole", "Drake", "Ellis", "Foley",
];

function pickN<T>(arr: T[], n: number): T[] {
  return arr.slice(0, n);
}
function randInt(maxExclusive: number): number {
  return Math.floor(Math.random() * maxExclusive);
}

/**
 * Distribute `total` teams across 4 divisions with each getting at
 * least 3. Total must be ≥ 12.
 */
function distributeWithFloor(total: number, divs: number, floor: number): number[] {
  const counts = new Array<number>(divs).fill(floor);
  let remaining = total - floor * divs;
  if (remaining < 0) throw new Error(`Total ${total} below floor ${floor}*${divs}`);
  while (remaining > 0) {
    counts[randInt(divs)]++;
    remaining--;
  }
  return counts;
}

function sqlString(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

async function findOrganizerProfileId(): Promise<string> {
  const rows = await mgmtSql<{ id: string }[]>(
    `SELECT id FROM profiles WHERE role = 'admin' AND is_test = false ORDER BY created_at LIMIT 1;`
  );
  if (!rows[0]) throw new Error("No site admin profile found to act as creator");
  return rows[0].id;
}

async function deleteSeed() {
  console.log("Wiping previous test tournaments + test profiles...");

  const tids = await mgmtSql<{ id: string }[]>(
    `SELECT id FROM tournaments WHERE title LIKE '${TOURNAMENT_TITLE_PREFIX.replace(/'/g, "''")}%';`
  );
  for (const t of tids) {
    await mgmtSql(`DELETE FROM tournament_active_divisions WHERE tournament_id = '${t.id}';`);
    await mgmtSql(`DELETE FROM tournament_matches WHERE tournament_id = '${t.id}';`);
    await mgmtSql(`DELETE FROM tournament_registrations WHERE tournament_id = '${t.id}';`);
    await mgmtSql(`DELETE FROM tournaments WHERE id = '${t.id}';`);
  }
  console.log(`  Deleted ${tids.length} test tournament(s).`);

  // Delete test profiles created by this script (no auth.users entry,
  // is_test=true, [TEST] prefix). Leave any other test profiles alone
  // — they may belong to other seed scripts.
  const tprof = await mgmtSql<{ count: number }[]>(
    `WITH d AS (DELETE FROM profiles
       WHERE is_test = true
         AND user_id IS NULL
         AND display_name LIKE '[TEST] %'
       RETURNING id)
     SELECT count(*)::int AS count FROM d;`
  );
  console.log(`  Deleted ${tprof[0]?.count ?? 0} test profile(s).`);
}

async function seed() {
  const organizerId = await findOrganizerProfileId();
  console.log(`Organizer profile: ${organizerId}`);

  // ── Profiles (60 male, 60 female) ────────────────────────────────
  const males = pickN(MALE_FIRSTS, 60).map((first, i) => ({
    first,
    last: LASTS[i % LASTS.length],
    suffix: String(i + 1).padStart(2, "0"),
  }));
  const females = pickN(FEMALE_FIRSTS, 60).map((first, i) => ({
    first,
    last: LASTS[(i + 4) % LASTS.length],
    suffix: String(i + 1).padStart(2, "0"),
  }));

  type ProfileSeed = { display_name: string; full_name: string; first: string; last: string; email: string };
  const buildSeeds = (xs: typeof males, kind: "M" | "F"): ProfileSeed[] =>
    xs.map((p) => {
      const display = `[TEST] ${kind}${p.suffix} ${p.first} ${p.last}`;
      return {
        display_name: display,
        full_name: `${p.first} ${p.last}`,
        first: p.first,
        last: p.last,
        email: `test-${kind.toLowerCase()}${p.suffix}-${Date.now()}@test.local`,
      };
    });
  const maleSeeds = buildSeeds(males, "M");
  const femaleSeeds = buildSeeds(females, "F");

  console.log(`Inserting ${maleSeeds.length + femaleSeeds.length} test profiles...`);

  const valuesSql = [...maleSeeds, ...femaleSeeds]
    .map(
      (p) =>
        `(${sqlString(p.full_name)}, ${sqlString(p.display_name)}, ${sqlString(p.first)}, ${sqlString(p.last)}, ${sqlString(p.email)}, 'player', true, true, NOW(), '{email}'::text[])`
    )
    .join(",\n");

  const inserted = await mgmtSql<{ id: string; display_name: string }[]>(
    `INSERT INTO profiles (full_name, display_name, first_name, last_name, email, role, is_active, is_test, member_since, preferred_notify)
     VALUES ${valuesSql}
     RETURNING id, display_name;`
  );

  const maleIds = inserted
    .filter((r) => r.display_name.startsWith("[TEST] M"))
    .map((r) => r.id);
  const femaleIds = inserted
    .filter((r) => r.display_name.startsWith("[TEST] F"))
    .map((r) => r.id);
  console.log(`  ${maleIds.length} male + ${femaleIds.length} female profiles created`);

  // ── Tournament ───────────────────────────────────────────────────
  const startDate = new Date(Date.now() + 14 * 86400_000).toISOString().slice(0, 10);
  const endDate = new Date(Date.now() + 15 * 86400_000).toISOString().slice(0, 10);
  const tTitle = `${TOURNAMENT_TITLE_PREFIX} ${new Date().toISOString().slice(0, 10)}`;

  const divsArrayLiteral = `ARRAY[${ALL_DIVS.map(sqlString).join(",")}]::TEXT[]`;
  const tRows = await mgmtSql<{ id: string }[]>(
    `INSERT INTO tournaments
       (title, description, format, type, divisions, start_date, end_date,
        location, num_courts, score_to_win_pool, score_to_win_playoff,
        win_by_2, finals_best_of_3, status, created_by)
     VALUES (
       ${sqlString(tTitle)},
       ${sqlString("Auto-seeded test tournament. 60 teams across the 12 All Ages divisions. Safe to delete.")},
       'round_robin', 'doubles', ${divsArrayLiteral},
       '${startDate}', '${endDate}',
       'Athens, TN', 6, 11, 11,
       false, false, 'registration_closed',
       '${organizerId}'
     )
     RETURNING id;`
  );
  const tournamentId = tRows[0].id;
  console.log(`Tournament: ${tTitle} (${tournamentId})`);

  // ── Decide team counts per division ─────────────────────────────
  const mensCounts = distributeWithFloor(20, 4, 3);
  const womensCounts = distributeWithFloor(20, 4, 3);
  const mixedCounts = distributeWithFloor(20, 4, 3);

  console.log("Division team counts:");
  MENS_DIVS.forEach((d, i) => console.log(`  ${d}: ${mensCounts[i]}`));
  WOMENS_DIVS.forEach((d, i) => console.log(`  ${d}: ${womensCounts[i]}`));
  MIXED_DIVS.forEach((d, i) => console.log(`  ${d}: ${mixedCounts[i]}`));

  // ── Build registrations (anchor + partner) ──────────────────────
  let mIdx = 0;
  let fIdx = 0;
  type Reg = { player_id: string; partner_id: string; division: string };
  const regs: Reg[] = [];

  // Mens: 2 males per team
  MENS_DIVS.forEach((div, i) => {
    for (let t = 0; t < mensCounts[i]; t++) {
      regs.push({ player_id: maleIds[mIdx++], partner_id: maleIds[mIdx++], division: div });
    }
  });
  // Womens: 2 females per team
  WOMENS_DIVS.forEach((div, i) => {
    for (let t = 0; t < womensCounts[i]; t++) {
      regs.push({ player_id: femaleIds[fIdx++], partner_id: femaleIds[fIdx++], division: div });
    }
  });
  // Mixed: 1 male + 1 female per team
  MIXED_DIVS.forEach((div, i) => {
    for (let t = 0; t < mixedCounts[i]; t++) {
      regs.push({ player_id: maleIds[mIdx++], partner_id: femaleIds[fIdx++], division: div });
    }
  });

  console.log(
    `Built ${regs.length} team registrations (males used: ${mIdx}/60, females used: ${fIdx}/60)`
  );
  if (regs.length !== 60) throw new Error(`Expected 60 teams, got ${regs.length}`);

  // ── Insert registrations ────────────────────────────────────────
  const regValuesSql = regs
    .map(
      (r) =>
        `('${tournamentId}', '${r.player_id}', '${r.partner_id}', ${sqlString(r.division)}, 'confirmed', NOW())`
    )
    .join(",\n");

  await mgmtSql(
    `INSERT INTO tournament_registrations (tournament_id, player_id, partner_id, division, status, registered_at)
     VALUES ${regValuesSql};`
  );
  console.log(`Inserted ${regs.length} confirmed registrations.`);

  console.log("\n=== Done ===");
  console.log(`Tournament URL: https://tristarpickleball.vercel.app/tournaments/${tournamentId}`);
  console.log(`To wipe: npx tsx scripts/seed-test-tournament.ts --delete`);
}

const isDelete = process.argv.includes("--delete");
(isDelete ? deleteSeed() : seed()).catch((e) => {
  console.error("FAIL:", e.message ?? e);
  process.exit(1);
});
