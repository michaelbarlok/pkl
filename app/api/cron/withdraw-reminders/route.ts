export const dynamic = "force-dynamic";

import { verifyCronSecret } from "@/lib/cron-auth";
import { runWithdrawReminders } from "@/lib/cron-jobs/withdraw-reminders";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/cron/withdraw-reminders
 *
 * Kept as a manual-trigger endpoint after the consolidation. The
 * Vercel cron entry was removed in favor of `/api/cron/tick`, which
 * runs this job every 5 minutes alongside the other reminders.
 */
export async function GET(request: NextRequest) {
  const authError = verifyCronSecret(request);
  if (authError) return authError;
  const result = await runWithdrawReminders();
  return NextResponse.json(result);
}
