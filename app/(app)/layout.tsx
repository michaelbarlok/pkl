import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { AppNav } from "./nav";
import { MobileNav } from "./mobile-nav";
import { MissingProfile } from "./missing-profile";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Unauthenticated visitors — render without nav/chrome.
  // The middleware already restricts which pages are publicly accessible;
  // individual pages handle the no-user case (e.g. landing page at /).
  if (!user) {
    return (
      <div className="min-h-screen bg-dark-950">
        <main className="mx-auto max-w-7xl px-3 py-4 pb-20 sm:px-6 md:pb-6 lg:px-8">
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

  return (
    <div className="min-h-screen bg-dark-950">
      <AppNav profile={profile} />
      <main className="mx-auto max-w-7xl px-3 py-4 pb-20 sm:px-6 md:pb-6 lg:px-8">
        {children}
      </main>
      <MobileNav profile={profile} />
    </div>
  );
}
