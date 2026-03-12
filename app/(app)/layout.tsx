import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { AppNav } from "./nav";
import { MobileNav } from "./mobile-nav";
import { MissingProfile } from "./missing-profile";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", user.id)
    .single();

  if (!profile) {
    return (
      <div className="min-h-screen bg-cream-50">
        <MissingProfile />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream-50">
      <AppNav profile={profile} />
      <main className="mx-auto max-w-7xl px-4 py-6 pb-20 sm:px-6 md:pb-6 lg:px-8">
        {children}
      </main>
      <MobileNav profile={profile} />
    </div>
  );
}
