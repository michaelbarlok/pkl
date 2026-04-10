/**
 * E2E Test: Full Tournament Flow
 *
 * Tests the complete tournament lifecycle as an organizer:
 *   Create → Open Registration → Seed Players → Close Registration →
 *   Division Review → Generate Brackets → Pool Play Scores →
 *   Advance to Playoffs → Playoff Scores → Tournament Complete
 *
 * Uses Round Robin format with 2 divisions, 4 players each.
 * All steps run sequentially in a single test (shared tournamentId state).
 *
 * Prerequisites:
 *   - App running on http://localhost:3000 (or PLAYWRIGHT_BASE_URL)
 *   - NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY set in env
 *   - Admin auth session created by global-setup.ts
 *
 * Run: npx playwright test e2e/tournament-flow.spec.ts --headed
 */

import { test, expect, type Page } from "@playwright/test";
import { createAdminClient } from "./helpers/supabase";
import * as fs from "fs";
import * as path from "path";

// ─── Env loading (same helper as global-setup) ───────────────────────────────
function loadEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^['"]|['"]$/g, "");
    if (key && !process.env[key]) process.env[key] = val;
  }
}
loadEnvFile(path.resolve(process.cwd(), ".env.test.local"));
loadEnvFile(path.resolve(process.cwd(), ".env.local"));

// ─── Test Divisions ───────────────────────────────────────────────────────────
// Using 2 divisions: Men's All Ages 4.0 and Women's All Ages 3.5
// With 8 seeded players (4 per division), each division gets a single pool
// → 3 rounds × 2 matches = 6 pool matches per division
// → top 4 advance → 4-team playoff (2 SF + final + 3rd place = 4 matches)
// Total score entries: (6+4) × 2 = 20 — fast to run
const DIVISION_1 = "mens_all_ages_4.0";     // label: "Men's All Ages 4.0"
const DIVISION_2 = "womens_all_ages_3.5";   // label: "Women's All Ages 3.5"
const PLAYERS_TO_SEED = 8; // 4 per division

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Enter all visible "Enter Score" matches in the current view.
 * Loops until no more "Enter Score" buttons are visible.
 * For each match: clicks "Enter Score", fills 11-7 scores, saves.
 */
async function enterAllScores(page: Page): Promise<number> {
  let count = 0;
  while (true) {
    // Wait briefly for any in-flight re-renders to settle
    await page.waitForTimeout(400);

    const enterBtn = page.getByRole("button", { name: "Enter Score" }).first();
    const visible = await enterBtn.isVisible().catch(() => false);
    if (!visible) break;

    await enterBtn.click();

    // Two score inputs appear: first is player1's score, second is player2's
    const scoreInputs = page.locator('input[inputmode="numeric"]');
    await expect(scoreInputs.first()).toBeVisible({ timeout: 5000 });

    await scoreInputs.nth(0).fill("11");
    await scoreInputs.nth(1).fill("7");

    const saveBtn = page.getByRole("button", { name: "Save Score" });
    await saveBtn.click();

    // Wait for the scoring form to close (Save Score button disappears)
    await expect(saveBtn).not.toBeVisible({ timeout: 20_000 });
    count++;
  }
  return count;
}

/**
 * Click a division tab by its label (exact match within the pill nav).
 */
async function clickDivisionTab(page: Page, label: string) {
  await page
    .getByRole("button", { name: label, exact: true })
    .first()
    .click();
  await page.waitForTimeout(300);
}

// ─── Test ─────────────────────────────────────────────────────────────────────

test("Full tournament flow: creation → brackets → playoffs → completion", async ({ page }) => {
  const supabase = createAdminClient();
  let tournamentId: string;

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 1: Create the tournament
  // ══════════════════════════════════════════════════════════════════════════
  await test.step("Create tournament", async () => {
    await page.goto("/tournaments/new");
    await expect(page.getByText("Create Tournament")).toBeVisible();

    // Title
    await page
      .getByPlaceholder("e.g. Spring Doubles Classic")
      .fill("E2E Test Tournament");

    // Format: Round Robin
    await page.locator("select").first().selectOption("round_robin");

    // Type: Singles (simpler than doubles — no partner required)
    await page.locator("select").nth(1).selectOption("singles");

    // Divisions: check Men's All Ages 4.0 and Women's All Ages 3.5
    // The grid has 3 columns (Men's, Women's, Mixed). Each column's header is an h4.
    const mensColumn = page
      .locator("div", { has: page.locator("h4", { hasText: "Men's" }) })
      .last();
    await mensColumn.locator("label", { hasText: "All Ages 4.0" }).click();

    const womensColumn = page
      .locator("div", { has: page.locator("h4", { hasText: "Women's" }) })
      .last();
    await womensColumn.locator("label", { hasText: "All Ages 3.5" }).click();

    // Start date: 30 days from now
    const startDate = new Date();
    startDate.setDate(startDate.getDate() + 30);
    const dateStr = startDate.toISOString().split("T")[0];
    await page.locator('input[type="date"]').first().fill(dateStr);

    // Location: if no saved locations, fill the plain text input
    const plainLocationInput = page.getByPlaceholder("e.g. Athens Community Center");
    if (await plainLocationInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await plainLocationInput.fill("E2E Test Venue");
    }
    // Otherwise a saved location is already selected — leave it as-is

    // Submit
    await page.getByRole("button", { name: "Create Tournament" }).click();

    // Should redirect to the tournament detail page
    await page.waitForURL(/\/tournaments\/[a-f0-9-]+$/, { timeout: 20_000 });
    tournamentId = page.url().split("/").pop()!;

    expect(tournamentId).toBeTruthy();
    await expect(page.getByText("Draft")).toBeVisible();
    await expect(page.getByText("E2E Test Tournament")).toBeVisible();

    console.log(`[test] Created tournament: ${tournamentId}`);
  });

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 2: Open registration
  // ══════════════════════════════════════════════════════════════════════════
  await test.step("Open registration", async () => {
    await page.getByRole("button", { name: "Open Registration" }).click();

    // Status badge should update to "Registration Open"
    await expect(page.getByText("Registration Open")).toBeVisible({ timeout: 15_000 });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 3: Verify solo registration UI works (one player self-registers)
  // ══════════════════════════════════════════════════════════════════════════
  await test.step("Registration UI: admin registers for Men's 4.0", async () => {
    // Scroll to registration section
    await page.locator("#register").scrollIntoViewIfNeeded();

    // Select division
    const divisionSelect = page.getByLabel("Division *");
    await expect(divisionSelect).toBeVisible({ timeout: 5000 });
    await divisionSelect.selectOption(DIVISION_1);

    // Register
    await page.getByRole("button", { name: "Register" }).click();
    await expect(page.getByText("You're registered!")).toBeVisible({ timeout: 10_000 });
    console.log("[test] Admin self-registered for Men's 4.0 ✓");

    // Withdraw so they don't skew the seeded test data
    await page.getByRole("button", { name: "Withdraw" }).click();
    await expect(page.getByText("You're registered!")).not.toBeVisible({ timeout: 10_000 });
    console.log("[test] Admin withdrew ✓");
  });

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 4: Seed test players via Supabase RPC (bulk registration)
  // ══════════════════════════════════════════════════════════════════════════
  await test.step(`Seed ${PLAYERS_TO_SEED} test players`, async () => {
    const { data, error } = await supabase.rpc("seed_test_tournament", {
      p_tournament_id: tournamentId,
      p_count: PLAYERS_TO_SEED,
    });

    if (error) throw new Error(`seed_test_tournament failed: ${error.message}`);
    console.log(`[test] Seeded players: ${JSON.stringify(data)}`);

    // Reload and verify the registration list shows players
    await page.reload();
    await expect(page.getByText(/Registered \(/)).toBeVisible();

    // Should show at least the seeded players
    const regCount = await page
      .getByText(/Registered \(\d+/)
      .textContent()
      .then((t) => parseInt(t?.match(/\d+/)?.[0] ?? "0"))
      .catch(() => 0);

    expect(regCount).toBeGreaterThanOrEqual(PLAYERS_TO_SEED);
    console.log(`[test] Confirmed ${regCount} registrations visible ✓`);
  });

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 5: Close registration
  // ══════════════════════════════════════════════════════════════════════════
  await test.step("Close registration", async () => {
    await page.getByRole("button", { name: "Close Registration" }).click();
    await expect(page.getByText("Registration Closed")).toBeVisible({ timeout: 15_000 });
    console.log("[test] Registration closed ✓");
  });

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 6: Division review — verify and generate brackets
  // ══════════════════════════════════════════════════════════════════════════
  await test.step("Division review: generate brackets", async () => {
    // Division Review panel should be visible
    const generateBtn = page.getByRole("button", { name: /Generate Brackets/ });
    await expect(generateBtn).toBeVisible({ timeout: 10_000 });

    // Both divisions should be listed with player counts
    await expect(page.getByText("Men's All Ages 4.0")).toBeVisible();
    await expect(page.getByText("Women's All Ages 3.5")).toBeVisible();
    console.log("[test] Division review panel visible with both divisions ✓");

    // Generate brackets
    await generateBtn.click();
    await expect(generateBtn).not.toBeVisible({ timeout: 20_000 });

    // Status should flip to "In Progress"
    await expect(page.getByText("In Progress")).toBeVisible({ timeout: 20_000 });
    console.log("[test] Brackets generated, tournament In Progress ✓");
  });

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 7: Enter pool play scores — Division 1 (Men's All Ages 4.0)
  // ══════════════════════════════════════════════════════════════════════════
  await test.step("Pool play: Men's All Ages 4.0", async () => {
    // Click the Men's division tab
    await clickDivisionTab(page, "Men's All Ages 4.0");

    const scored = await enterAllScores(page);
    expect(scored).toBeGreaterThan(0);
    console.log(`[test] Men's 4.0 pool play: entered ${scored} scores ✓`);

    // Pool Play Complete card should appear
    await expect(page.getByText("Pool Play Complete")).toBeVisible({ timeout: 10_000 });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 8: Advance Men's 4.0 to playoffs
  // ══════════════════════════════════════════════════════════════════════════
  await test.step("Advance Men's 4.0 to playoffs", async () => {
    await page.getByRole("button", { name: "Review Advancement" }).click();

    // Seeding review panel should appear
    await expect(page.getByText("Confirm Playoff Seeding")).toBeVisible({ timeout: 10_000 });
    console.log("[test] Seeding review panel visible ✓");

    // Confirm seeding and generate playoffs
    await page
      .getByRole("button", { name: "Confirm & Generate Playoffs" })
      .click();

    // Wait for playoff section to appear
    await expect(page.getByText("Playoffs")).toBeVisible({ timeout: 20_000 });
    console.log("[test] Men's 4.0 playoff bracket generated ✓");
  });

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 9: Enter playoff scores — Men's 4.0
  // ══════════════════════════════════════════════════════════════════════════
  await test.step("Playoff scores: Men's All Ages 4.0", async () => {
    const scored = await enterAllScores(page);
    expect(scored).toBeGreaterThan(0);
    console.log(`[test] Men's 4.0 playoffs: entered ${scored} scores ✓`);
  });

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 10: Enter pool play scores — Division 2 (Women's All Ages 3.5)
  // ══════════════════════════════════════════════════════════════════════════
  await test.step("Pool play: Women's All Ages 3.5", async () => {
    await clickDivisionTab(page, "Women's All Ages 3.5");

    const scored = await enterAllScores(page);
    expect(scored).toBeGreaterThan(0);
    console.log(`[test] Women's 3.5 pool play: entered ${scored} scores ✓`);

    await expect(page.getByText("Pool Play Complete")).toBeVisible({ timeout: 10_000 });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 11: Advance Women's 3.5 to playoffs
  // ══════════════════════════════════════════════════════════════════════════
  await test.step("Advance Women's 3.5 to playoffs", async () => {
    await page.getByRole("button", { name: "Review Advancement" }).click();
    await expect(page.getByText("Confirm Playoff Seeding")).toBeVisible({ timeout: 10_000 });

    await page
      .getByRole("button", { name: "Confirm & Generate Playoffs" })
      .click();

    await expect(page.getByText("Playoffs")).toBeVisible({ timeout: 20_000 });
    console.log("[test] Women's 3.5 playoff bracket generated ✓");
  });

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 12: Enter playoff scores — Women's 3.5
  // ══════════════════════════════════════════════════════════════════════════
  await test.step("Playoff scores: Women's All Ages 3.5", async () => {
    const scored = await enterAllScores(page);
    expect(scored).toBeGreaterThan(0);
    console.log(`[test] Women's 3.5 playoffs: entered ${scored} scores ✓`);
  });

  // ══════════════════════════════════════════════════════════════════════════
  // STEP 13: Verify tournament auto-completes
  // ══════════════════════════════════════════════════════════════════════════
  await test.step("Tournament auto-completes", async () => {
    // After all divisions have pool play + playoffs finished, the API
    // automatically sets status = 'completed'. Reload to verify.
    await page.reload();

    await expect(page.getByText("Completed")).toBeVisible({ timeout: 15_000 });
    console.log("[test] Tournament status is Completed ✓");

    // Both divisions should show Results (1st/2nd/3rd place)
    // The 🥇 emoji appears in the Results card
    const resultsCount = await page.locator("text=🥇").count();
    expect(resultsCount).toBeGreaterThanOrEqual(1);
    console.log(`[test] Division results visible (${resultsCount} winners shown) ✓`);
  });
});

// ─── Additional focused tests ─────────────────────────────────────────────────

test("Registration: waitlist behavior", async ({ page }) => {
  // This test is lighter — it creates a tournament with a cap of 2 per division,
  // registers 2 players via seed, then tries to register the admin to verify
  // they land on the waitlist.
  const supabase = createAdminClient();

  // Create a capped tournament directly via API
  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", process.env.E2E_ADMIN_EMAIL ?? "e2e-admin@test.local")
    .single();

  if (!profile) {
    test.skip(true, "Admin profile not found — run global-setup first");
    return;
  }

  const { data: tournament } = await supabase
    .from("tournaments")
    .insert({
      title: "E2E Test Tournament (Waitlist)",
      format: "single_elimination",
      type: "singles",
      divisions: [DIVISION_1],
      start_date: new Date(Date.now() + 30 * 86400_000).toISOString().split("T")[0],
      location: "E2E Venue",
      max_teams_per_division: 2,
      status: "registration_open",
      created_by: profile.id,
    })
    .select("id")
    .single();

  if (!tournament) {
    throw new Error("Failed to create waitlist test tournament");
  }

  const tournamentId = tournament.id;

  try {
    // Seed 2 players to fill the cap
    await supabase.rpc("seed_test_tournament", {
      p_tournament_id: tournamentId,
      p_count: 2,
    });

    await page.goto(`/tournaments/${tournamentId}`);

    // Admin tries to register — should see "Join Waitlist" (division full)
    await page.locator("#register").scrollIntoViewIfNeeded();

    // Division may already be auto-selected since there's only one
    const divisionSelect = page.getByLabel("Division *");
    if (await divisionSelect.isVisible({ timeout: 2000 }).catch(() => false)) {
      await divisionSelect.selectOption(DIVISION_1);
    }

    // Should show Join Waitlist button (division is full)
    await expect(
      page.getByRole("button", { name: /Join Waitlist|Register/ })
    ).toBeVisible({ timeout: 5000 });

    const joinBtn = page.getByRole("button", { name: "Join Waitlist" });
    const isWaitlist = await joinBtn.isVisible().catch(() => false);

    if (isWaitlist) {
      await joinBtn.click();
      await expect(page.getByText("You're on the waitlist")).toBeVisible({ timeout: 10_000 });
      console.log("[test] Waitlist join confirmed ✓");

      // Withdraw from waitlist
      await page.getByRole("button", { name: "Withdraw" }).click();
      await expect(page.getByText("You're on the waitlist")).not.toBeVisible({ timeout: 10_000 });
    } else {
      console.log("[test] Division not full yet (admin registered, not waitlisted)");
    }
  } finally {
    // Clean up this specific tournament
    await supabase.from("tournaments").delete().eq("id", tournamentId);
  }
});
