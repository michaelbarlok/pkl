import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { AppNav } from "./nav";
import { MobileNav } from "./mobile-nav";
import { MissingProfile } from "./missing-profile";
import { LandingNav } from "./landing-nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Unauthenticated visitors — render without nav/chrome.
  // The middleware already restricts which pages are publicly accessible;
  // individual pages handle the no-user case (e.g. landing page at /).
  if (!user) {
    return (
      <div className="min-h-screen bg-dark-950 flex flex-col">
        <LandingNav />
        <main className="flex-1 mx-auto w-full max-w-7xl px-3 pt-20 pb-8 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", user.id)
    .single();

  if (!profile) {
    return (
      <div className="min-h-screen bg-dark-950">
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
    <div className="min-h-screen bg-dark-950">
      <AppNav profile={profile} isGroupAdmin={isGroupAdmin} />
      <main className="mx-auto max-w-7xl px-3 py-4 pb-20 sm:px-6 md:pb-6 lg:px-8">
        {children}
      </main>
      <MobileNav profile={profile} isGroupAdmin={isGroupAdmin} />
    </div>
  );
}
