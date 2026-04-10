/**
 * Playwright Global Setup
 *
 * Runs once before all E2E tests.
 * 1. Loads .env.local so Supabase credentials are available
 * 2. Creates (or resets) the E2E admin user in Supabase
 * 3. Logs in via browser to capture auth cookies
 * 4. Saves auth state to e2e/.auth/admin.json for test reuse
 */

import { chromium } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { createAdminClient } from "./helpers/supabase";

// ─── Load .env.local into process.env ────────────────────────────────────────
// Playwright runs outside Next.js so we must manually load env vars.
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
    if (key && !process.env[key]) {
      process.env[key] = val;
    }
  }
}

// Load in priority order: test-specific overrides first, then app defaults
loadEnvFile(path.resolve(process.cwd(), ".env.test.local"));
loadEnvFile(path.resolve(process.cwd(), ".env.local"));
loadEnvFile(path.resolve(process.cwd(), ".env"));

// ─── Config ───────────────────────────────────────────────────────────────────

const E2E_ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "e2e-admin@test.local";
const E2E_ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "e2eTestPassword123!";
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const AUTH_DIR = path.join(__dirname, ".auth");

// ─── Setup ───────────────────────────────────────────────────────────────────

export default async function globalSetup() {
  fs.mkdirSync(AUTH_DIR, { recursive: true });

  const supabase = createAdminClient();

  // ── 1. Create or retrieve E2E admin user ───────────────────────────────────
  console.log(`[setup] Preparing E2E admin user: ${E2E_ADMIN_EMAIL}`);

  let userId: string;

  // Check if user already exists
  const { data: userList } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  const existing = userList?.users?.find((u: any) => u.email === E2E_ADMIN_EMAIL);

  if (existing) {
    userId = existing.id;
    // Reset password in case it was changed
    await supabase.auth.admin.updateUserById(userId, {
      password: E2E_ADMIN_PASSWORD,
      email_confirm: true,
    });
    console.log(`[setup] Reusing existing admin user (${userId.slice(0, 8)}...)`);
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email: E2E_ADMIN_EMAIL,
      password: E2E_ADMIN_PASSWORD,
      email_confirm: true,
    });
    if (error) throw new Error(`Failed to create E2E admin user: ${error.message}`);
    userId = data.user!.id;
    console.log(`[setup] Created admin user (${userId.slice(0, 8)}...)`);
  }

  // ── 2. Ensure admin profile exists ────────────────────────────────────────
  const { data: existingProfile } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", userId)
    .single();

  if (!existingProfile) {
    const { error: profileError } = await supabase.from("profiles").insert({
      user_id: userId,
      full_name: "E2E Admin",
      display_name: "[E2E] Admin",
      email: E2E_ADMIN_EMAIL,
      role: "admin",
      is_active: true,
      member_since: new Date().toISOString(),
      preferred_notify: ["email"],
    });
    if (profileError) throw new Error(`Failed to create profile: ${profileError.message}`);
  } else {
    // Ensure admin role in case it was downgraded
    await supabase
      .from("profiles")
      .update({ role: "admin" })
      .eq("user_id", userId);
  }

  // Save user ID for global-teardown to use
  fs.writeFileSync(path.join(AUTH_DIR, "admin-id.txt"), userId);

  // ── 3. Log in via browser to capture Supabase SSR auth cookies ────────────
  console.log(`[setup] Logging in to capture auth session...`);
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(`${BASE_URL}/login`);
  await page.fill("#email", E2E_ADMIN_EMAIL);
  await page.fill("#password", E2E_ADMIN_PASSWORD);
  await page.click('button[type="submit"]');

  // Wait for successful redirect (Next.js sends to /dashboard after login)
  await page.waitForURL(/\/(dashboard|tournaments)/, { timeout: 30_000 }).catch(async () => {
    // If URL didn't change, check for error message
    const errorText = await page.locator(".text-red-400").textContent().catch(() => "");
    throw new Error(`Login failed. Error: ${errorText || "No redirect happened"}`);
  });

  // Save auth cookies + localStorage to file
  await context.storageState({ path: path.join(AUTH_DIR, "admin.json") });
  await browser.close();

  console.log(`[setup] Auth session saved to e2e/.auth/admin.json`);
  console.log(`[setup] Global setup complete ✓`);
}
