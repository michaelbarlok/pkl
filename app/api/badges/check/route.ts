import { requireAuth } from "@/lib/auth";
import { checkAndAwardBadges } from "@/lib/badges";
import type { BadgeCategory } from "@/types/database";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/badges/check
 *
 * Trigger badge evaluation for the current user.
 * Optionally limit to specific categories for performance.
 *
 * Body: { categories?: BadgeCategory[] }
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const body = await request.json().catch(() => ({}));
  const categories: BadgeCategory[] | undefined = body.categories;

  const newBadges = await checkAndAwardBadges(auth.profile.id, categories);

  return NextResponse.json({ newBadges });
}
