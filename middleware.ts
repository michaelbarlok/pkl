import { updateSession } from "@/lib/supabase/middleware";
import { rateLimit } from "@/lib/rate-limit";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // --- Rate limiting for API routes ---
  if (path.startsWith("/api")) {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip") ??
      "unknown";

    // Stricter limits for auth-related and cron routes
    const isAuthRoute = path.startsWith("/api/register") || path.startsWith("/api/auth");
    const isCronRoute = path.startsWith("/api/cron");

    let limit: number;
    let windowMs: number;

    if (isCronRoute) {
      // Cron: 5 requests per minute (Vercel calls once per schedule)
      limit = 5;
      windowMs = 60_000;
    } else if (isAuthRoute) {
      // Auth: 10 requests per minute per IP
      limit = 10;
      windowMs = 60_000;
    } else {
      // General API: 60 requests per minute per IP
      limit = 60;
      windowMs = 60_000;
    }

    const key = `${ip}:${isCronRoute ? "cron" : isAuthRoute ? "auth" : "api"}`;
    const result = rateLimit(key, limit, windowMs);

    if (result.limited) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        {
          status: 429,
          headers: {
            "Retry-After": String(Math.ceil((result.resetAt - Date.now()) / 1000)),
            "X-RateLimit-Limit": String(limit),
            "X-RateLimit-Remaining": "0",
          },
        }
      );
    }
  }

  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
