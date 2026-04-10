import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  // Run tests sequentially — they share tournament state across steps
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  timeout: 120_000,
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    // Reuse saved login session — set in global-setup.ts
    storageState: "e2e/.auth/admin.json",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    // Generous timeouts for server-rendered pages and router.refresh() calls
    actionTimeout: 30_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  // Start the Next.js dev server automatically if not already running
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    // Reuse an already-running server (so you can run `npm run dev` first if you prefer)
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
