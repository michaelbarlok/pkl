export const dynamic = "force-dynamic";

import { createServiceClient } from "@/lib/supabase/server";
import { verifyCronSecret } from "@/lib/cron-auth";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/cron/tournament-registration-windows
 *
 * Runs every minute (see vercel.json). Walks tournaments whose
 * registration window boundaries have passed and flips status
 * accordingly:
 *
 *   status=draft              + registration_opens_at  <= now
 *     → status=registration_open
 *   status=registration_open  + registration_closes_at <= now
 *     → status=registration_closed
 *
 * Missed fires self-heal — a tournament whose open time slipped
 * past a Vercel cron outage still gets flipped the next minute.
 *
 * We deliberately only move FORWARD through the status graph:
 * never reopen a closed tournament, never revert in_progress back
 * to registration, etc. Organizers can always override manually.
 */
export async function GET(request: NextRequest) {
  const authError = verifyCronSecret(request);
  if (authError) return authError;

  const supabase = await createServiceClient();
  const nowIso = new Date().toISOString();

  // 1. draft → registration_open when the opens-at time has hit.
  const { data: opened, error: openErr } = await supabase
    .from("tournaments")
    .update({ status: "registration_open" })
    .eq("status", "draft")
    .not("registration_opens_at", "is", null)
    .lte("registration_opens_at", nowIso)
    .select("id, title");
  if (openErr) {
    return NextResponse.json({ error: openErr.message }, { status: 500 });
  }

  // 2. registration_open → registration_closed when closes-at hits.
  const { data: closed, error: closeErr } = await supabase
    .from("tournaments")
    .update({ status: "registration_closed" })
    .eq("status", "registration_open")
    .not("registration_closes_at", "is", null)
    .lte("registration_closes_at", nowIso)
    .select("id, title");
  if (closeErr) {
    return NextResponse.json({ error: closeErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    opened: (opened ?? []).length,
    closed: (closed ?? []).length,
  });
}
