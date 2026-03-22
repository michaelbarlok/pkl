import { NextRequest, NextResponse } from "next/server";

/**
 * Validates that a cron request is authorized.
 *
 * Vercel automatically sends an `Authorization: Bearer <CRON_SECRET>` header
 * when invoking cron jobs. This function checks that header against the
 * CRON_SECRET environment variable.
 *
 * If CRON_SECRET is not set, all requests are allowed (development mode).
 */
export function verifyCronSecret(request: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET;

  // In development or if not configured, allow all requests
  if (!secret) return null;

  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  return null;
}
