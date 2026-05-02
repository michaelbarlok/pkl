export const dynamic = "force-dynamic";

import { verifyCronSecret } from "@/lib/cron-auth";
import { runSignupReminders } from "@/lib/cron-jobs/signup-reminders";
import { runWithdrawReminders } from "@/lib/cron-jobs/withdraw-reminders";
import { runStartReminders } from "@/lib/cron-jobs/start-reminders";
import { runTournamentRegistrationWindows } from "@/lib/cron-jobs/tournament-registration-windows";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/cron/tick
 *
 * Consolidated 5-minute tick. Runs the four non-time-critical
 * background jobs that used to live in their own per-minute crons:
 *
 *   - signup-reminders            (T-60min before signup closes)
 *   - withdraw-reminders          (T-60min before withdraw closes)
 *   - start-reminders             (T-24h before event)
 *   - tournament-registration-windows (status flips on opens/closes)
 *
 * All four are run in parallel via Promise.allSettled — one job's
 * failure can't take down the others. Reminder windows were widened
 * from ±1min to ±3min to match the new cadence.
 *
 * `create-scheduled-sheets` stays on its own per-minute cron because
 * sheet auto-post must hit the exact specified minute (players
 * refresh waiting for it). The four jobs above tolerate ±5 minutes
 * with no UX impact: a "1 hour before" reminder firing at 55-65min
 * is indistinguishable from one firing at 59-61min, and tournament
 * status flips aren't user-facing to the second.
 */
export async function GET(request: NextRequest) {
  const authError = verifyCronSecret(request);
  if (authError) return authError;

  const [signup, withdraw, start, windows] = await Promise.allSettled([
    runSignupReminders(),
    runWithdrawReminders(),
    runStartReminders(),
    runTournamentRegistrationWindows(),
  ]);

  return NextResponse.json({
    signup_reminders: settle(signup),
    withdraw_reminders: settle(withdraw),
    start_reminders: settle(start),
    tournament_registration_windows: settle(windows),
  });
}

function settle<T>(r: PromiseSettledResult<T>): T | { error: string } {
  return r.status === "fulfilled"
    ? r.value
    : { error: r.reason instanceof Error ? r.reason.message : String(r.reason) };
}
