import { createClient } from "@supabase/supabase-js";

/**
 * Creates a Supabase client with the service role key.
 * Used in global-setup, global-teardown, and tests that need to
 * seed or query data directly (bypassing RLS).
 *
 * Reads env vars from process.env (loaded by playwright.config.ts or the shell).
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n" +
        "Copy your .env.local values to the shell before running Playwright:\n" +
        "  export NEXT_PUBLIC_SUPABASE_URL=...\n" +
        "  export SUPABASE_SERVICE_ROLE_KEY=...\n" +
        "Or add them to a .env.test.local file."
    );
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
