import { createClient, createServiceClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Sidebar } from "./sidebar";
import { MobileNav } from "./mobile-nav";
import { MissingProfile } from "./missing-profile";
import { LandingNav } from "./landing-nav";
import { NotificationBell } from "@/components/notification-bell";
import { Logo } from "@/components/logo";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Unauthenticated visitors — render without nav/chrome.
  // The middleware already restricts which pages are publicly accessible;
  // individual pages handle the no-user case (e.g. landing page at /).
  if (!user) {
    return (
      <div className="min-h-dvh bg-dark-950 flex flex-col">
        <LandingNav />
        <main className="flex-1 mx-auto w-full max-w-7xl px-3 pt-20 pb-8 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    );
  }

  // maybeSingle() treats zero rows as { data: null, error: null } — correct
  // for a new user who has no profile yet. single() would log PGRST116.
  let { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  // Profile missing — auto-create it (Google OAuth users who skip /api/register)
  if (!profile) {
    const serviceClient = await createServiceClient();
    const fullName =
      user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      user.email?.split("@")[0] ||
      "Player";

    const avatarUrl =
      user.user_metadata?.avatar_url ||
      user.user_metadata?.picture ||
      null;

    const { data: created } = await serviceClient
      .from("profiles")
      .upsert(
        {
          user_id: user.id,
          full_name: fullName,
          display_name: fullName,
          email: user.email ?? "",
          role: "player",
          member_since: new Date().toISOString(),
          preferred_notify: ["email"],
          ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
        },
        { onConflict: "user_id" }
      )
      .select("*")
      .single();

    profile = created;
  }

  if (!profile) {
    return (
      <div className="min-h-dvh bg-dark-950">
        <MissingProfile />
      </div>
    );
  }

  // Check if user is a group admin in any group
  let isGroupAdmin = false;
  if (profile.role !== "admin") {
    const { data: groupAdminCheck } = await supabase
      .from("group_memberships")
      .select("group_role")
      .eq("player_id", profile.id)
      .eq("group_role", "admin")
      .limit(1);
    isGroupAdmin = (groupAdminCheck?.length ?? 0) > 0;
  }

  return (
    <div className="flex min-h-dvh bg-dark-950">
      <Sidebar profile={profile} isGroupAdmin={isGroupAdmin} />
      <div className="flex flex-1 flex-col min-w-0">
        {/* Mobile header — logo + notification bell, desktop hidden */}
        <header className="md:hidden flex items-center justify-between px-4 h-12 border-b border-surface-border bg-surface shrink-0">
          <Link href="/dashboard">
            <Logo className="h-7 w-auto" />
          </Link>
          <NotificationBell profileId={profile.id} />
        </header>
        {/* The bottom padding has to clear the fixed MobileNav PLUS the
             iOS home-indicator safe-area. Without the env() term, the
             last bit of content slips behind the nav on phones with a
             home indicator. */}
        <main className="flex-1 px-3 py-4 pb-[calc(5rem+env(safe-area-inset-bottom))] sm:px-6 md:pb-6 lg:px-8">
          <div className="mx-auto w-full max-w-5xl animate-fade-in">
            {children}
          </div>
        </main>
      </div>
      <MobileNav profile={profile} isGroupAdmin={isGroupAdmin} />
    </div>
  );
}
