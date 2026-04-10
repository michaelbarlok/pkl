/**
 * Playwright Global Teardown
 *
 * Runs once after all E2E tests complete.
 * Cleans up all test data created during the test run:
 * - Test tournament users (seeded via seed_test_tournament)
 * - E2E test tournaments (identified by title prefix)
 * - The E2E admin user itself
 */

import * as fs from "fs";
import * as path from "path";
import { createAdminClient } from "./helpers/supabase";

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
loadEnvFile(path.resolve(process.cwd(), ".env"));

const E2E_ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "e2e-admin@test.local";
const AUTH_DIR = path.join(__dirname, ".auth");

export default async function globalTeardown() {
  const supabase = createAdminClient();

  console.log("[teardown] Cleaning up E2E test data...");

  // ── 1. Delete seeded test tournament players ───────────────────────────────
  const { data: rpcResult } = await supabase.rpc("delete_test_tournament_users");
  console.log(`[teardown] Deleted test tournament users: ${JSON.stringify(rpcResult)}`);

  // ── 2. Delete all E2E test tournaments ────────────────────────────────────
  const { data: deleted, error: delError } = await supabase
    .from("tournaments")
    .delete()
    .ilike("title", "E2E Test Tournament%")
    .select("id, title");

  if (delError) {
    console.warn(`[teardown] Warning: failed to delete test tournaments: ${delError.message}`);
  } else {
    console.log(`[teardown] Deleted ${deleted?.length ?? 0} test tournament(s)`);
  }

  // ── 3. Delete the E2E admin user ──────────────────────────────────────────
  const adminIdFile = path.join(AUTH_DIR, "admin-id.txt");
  if (fs.existsSync(adminIdFile)) {
    const adminUserId = fs.readFileSync(adminIdFile, "utf-8").trim();
    // Delete profile first (cascade should handle it but be explicit)
    await supabase.from("profiles").delete().eq("user_id", adminUserId);
    const { error: deleteError } = await supabase.auth.admin.deleteUser(adminUserId);
    if (deleteError) {
      console.warn(`[teardown] Warning: failed to delete admin user: ${deleteError.message}`);
    } else {
      console.log(`[teardown] Deleted E2E admin user`);
    }
    fs.unlinkSync(adminIdFile);
  } else {
    // Find by email
    const { data: userList } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    const user = userList?.users?.find((u: any) => u.email === E2E_ADMIN_EMAIL);
    if (user) {
      await supabase.from("profiles").delete().eq("user_id", user.id);
      await supabase.auth.admin.deleteUser(user.id);
      console.log(`[teardown] Deleted E2E admin user (found by email)`);
    }
  }

  console.log("[teardown] Cleanup complete ✓");
}
