"use client";

import { NotificationBell } from "@/components/notification-bell";
import { useSupabase } from "@/components/providers/supabase-provider";
import type { Profile } from "@/types/database";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

const playerNav = [
  { name: "Dashboard", href: "/" },
  { name: "Groups", href: "/groups" },
  { name: "Sheets", href: "/sheets" },
  { name: "Ratings", href: "/ratings" },
  { name: "Forum", href: "/forum" },
];

const adminNav = [
  { name: "Members", href: "/admin/members" },
  { name: "Sheets", href: "/admin/sheets" },
  { name: "Groups", href: "/admin/groups" },
  { name: "Sessions", href: "/admin/sessions" },
];

export function AppNav({ profile }: { profile: Profile }) {
  const pathname = usePathname();
  const { supabase } = useSupabase();
  const router = useRouter();
  const isAdmin = profile.role === "admin";

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <header className="border-b border-cream-300 bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            <img src="/pickletrack-logo.png" alt="PickleScore" className="h-10 w-auto" />
            <span className="text-lg font-bold text-dark-600">PickleScore</span>
          </Link>

          {/* Navigation */}
          <nav className="hidden md:flex items-center gap-1">
            {playerNav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  pathname === item.href
                    ? "bg-brand-50 text-brand-700"
                    : "text-dark-400 hover:bg-cream-100 hover:text-dark-600"
                )}
              >
                {item.name}
              </Link>
            ))}
            {isAdmin && (
              <>
                <span className="mx-2 h-5 w-px bg-cream-400" />
                {adminNav.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "rounded-md px-3 py-2 text-sm font-medium transition-colors",
                      pathname.startsWith(item.href)
                        ? "bg-brand-50 text-brand-700"
                        : "text-dark-400 hover:bg-cream-100 hover:text-dark-600"
                    )}
                  >
                    {item.name}
                  </Link>
                ))}
              </>
            )}
          </nav>

          {/* Right side: notification bell + profile */}
          <div className="flex items-center gap-3">
            <NotificationBell profileId={profile.id} />
            <Link
              href={`/players/${profile.id}`}
              className="flex items-center gap-2 text-sm text-dark-400 hover:text-dark-600"
            >
              {profile.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt=""
                  className="h-8 w-8 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-brand-700 text-sm font-medium">
                  {profile.display_name?.charAt(0).toUpperCase()}
                </div>
              )}
              <span className="hidden sm:block">{profile.display_name}</span>
            </Link>
            <button
              onClick={handleSignOut}
              className="text-sm text-dark-300 hover:text-dark-500"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
