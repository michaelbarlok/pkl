import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options as any)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Redirect unauthenticated users to login (except auth pages and API routes)
  const path = request.nextUrl.pathname;
  const isAuthPage = path.startsWith("/login") || path.startsWith("/register");
  const isApiRoute = path.startsWith("/api");
  const isPublicPage = path === "/" || path === "/contact" || path === "/groups" || path.startsWith("/groups/") || path.startsWith("/ratings") || path.startsWith("/ladder") || path === "/confirmed" || path.startsWith("/auth/confirm") || path.startsWith("/auth/callback") || path === "/reset-password" || path === "/forgot-password" || path === "/privacy" || path === "/terms" || path === "/how-it-works";

  if (!user && !isAuthPage && !isApiRoute && !isPublicPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    // Preserve the destination so post-login (or post-signup) the
    // user lands back where they were headed. Includes the query
    // string so deep links with params survive the auth bounce.
    const nextDest = path + request.nextUrl.search;
    url.search = "";
    if (nextDest && nextDest !== "/") {
      url.searchParams.set("next", nextDest);
    }
    return NextResponse.redirect(url);
  }

  // Redirect authenticated users away from auth pages — honor `next`
  // if present so users who tapped a shared link land where they
  // expected after whichever login path they took.
  if (user && isAuthPage) {
    const url = request.nextUrl.clone();
    const next = request.nextUrl.searchParams.get("next");
    url.pathname = next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
