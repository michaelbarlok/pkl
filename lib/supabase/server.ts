import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Server-side Supabase client using the connection pooler URL when available.
 * Set SUPABASE_POOLER_URL in your environment to use Supabase's pgbouncer
 * pooler for better connection management at scale.
 */
export async function createClient() {
  const cookieStore = await cookies();

  const supabaseUrl = process.env.SUPABASE_POOLER_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!;

  return createServerClient(
    supabaseUrl,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // setAll called from Server Component — can be ignored if middleware refreshes
          }
        },
      },
    }
  );
}

export async function createServiceClient() {
  const { createClient } = await import("@supabase/supabase-js");

  const supabaseUrl = process.env.SUPABASE_POOLER_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!;

  return createClient(
    supabaseUrl,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
