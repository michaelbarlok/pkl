import { createClient, createServiceClient } from "@/lib/supabase/server";
import { ensureProfile } from "@/lib/ensure-profile";
import { redirect } from "next/navigation";
import { Sidebar } from "./sidebar";
import { MobileNav } from "./mobile-nav";
import { MissingProfile } from "./missing-profile";
import { LastNameNudge } from "./last-name-nudge";
import { LandingNav } from "./landing-nav";
import { NotificationBell } from "@/components/notification-bell";
import { ThemeListener } from "@/components/theme-listener";
import { ActiveSessionAlert } from "@/components/active-session-alert";
import { TournamentCourtAlert } from "@/components/tournament-court-alert";
import { PWAInstallPrompt } from "@/components/pwa-install-prompt";
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

  // Profile missing — auto-create it. This is the last-resort safety
  // net. The primary creation paths (/auth/confirm for email/password,
  // /auth/callback for OAuth) already call ensureProfile, so by the
  // time we get here the row almost always exists. This branch covers
  // tabs killed mid-verify, server-action throws, etc. We refetch via
  // the regular client after ensureProfile so the rest of the layout
  // keeps the generated row type.
  if (!profile) {
    try {
      const serviceClient = await createServiceClient();
      await ensureProfile(serviceClient, user);
    } catch {
      // Non-fatal — fall through to refetch and the !profile branch.
    }
    const { data: refetched } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();
    profile = refetched;
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
          {/* Small screens keep a reading-friendly 5xl cap. On lg+
               we widen the layout so data-dense pages (tournament
               detail, court tracker) can fill the screen — pages
               with their own max-w continue to respect it, so
               reading pages stay readable. */}
          <div className="mx-auto w-full max-w-5xl lg:max-w-[120rem] animate-fade-in">
            {children}
          </div>
          {/* Persistent copyright notice — visible on every authenticated
               page so the ownership claim is consistent across the app. */}
          <p className="mx-auto mt-10 max-w-5xl text-center text-[11px] text-surface-muted">
            &copy; {new Date().getFullYear()} Tri-Star Pickleball. All rights reserved.
          </p>
        </main>
      </div>
      <MobileNav profile={profile} isGroupAdmin={isGroupAdmin} />
      <ThemeListener />
      {/* Global fallback for push-off users: if any session the
           viewer is checked in to transitions to round_active, this
           modal pops on whatever page they happen to be on and
           deep-links to the Play tab. Uses the same localStorage ack
           key as the Play-tab modal so they don't double-fire. */}
      <ActiveSessionAlert profileId={profile.id} />

      {/* Tournament counterpart: when a match the viewer's team is
           on gets assigned a court, pop a modal wherever they are
           and deep-link to the Play tab. Ack is per-match-id so a
           second court assignment for the same team re-triggers. */}
      <TournamentCourtAlert profileId={profile.id} />

      {/* Prompts signed-in users to add the PWA to their home screen.
           Self-throttles: first login visit stays quiet, shows on visit
           #2, #4, #6, … and turns itself off permanently once the app
           is installed on this device. After a successful install (or
           the first standalone launch on iOS) it also nudges the user
           to flip their notification preferences to push. */}
      <PWAInstallPrompt profileId={profile.id} />

      {/* Pops on every visit until the user fills in a last name. Once
           profile.last_name is non-null the component returns null and
           never shows again. We pass current first_name so the modal
           pre-fills it from the migration backfill. */}
      <LastNameNudge
        profileId={profile.id}
        initialFirstName={profile.first_name ?? null}
        initialLastName={profile.last_name ?? null}
      />
    </div>
  );
}
