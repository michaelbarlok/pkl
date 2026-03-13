"use client";

import { NotificationBell } from "@/components/notification-bell";
import { useSupabase } from "@/components/providers/supabase-provider";
import type { Profile } from "@/types/database";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

const playerNav = [
  { name: "Dashboard", href: "/dashboard" },
  { name: "Play", href: "/sessions/active" },
  { name: "Groups", href: "/groups" },
  { name: "Sheets", href: "/sheets" },
  { name: "Rankings", href: "/ratings" },
  { name: "Forum", href: "/forum" },
];

const adminNav = [
  { name: "Members", href: "/admin/members" },
  { name: "Sheets", href: "/admin/sheets" },
  { name: "Groups", href: "/admin/groups" },
  { name: "Sessions", href: "/admin/sessions" },
];

export function AppNav({ profile, isGroupAdmin = false }: { profile: Profile; isGroupAdmin?: boolean }) {
  const pathname = usePathname();
  const { supabase } = useSupabase();
  const router = useRouter();
  const isAdmin = profile.role === "admin";
  const showAdminNav = isAdmin || isGroupAdmin;

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <header className="border-b border-surface-border bg-surface">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-14 items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            <img src="/pkl-logo.png" alt="PKL" className="h-8 w-auto" />
          </Link>

          {/* Navigation */}
          <nav className="hidden md:flex items-center gap-0.5">
            {playerNav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  pathname === item.href || (item.href === "/sessions/active" && pathname.startsWith("/sessions/"))
                    ? "bg-brand-900/40 text-brand-300"
                    : "text-surface-muted hover:bg-surface-overlay hover:text-dark-100"
                )}
              >
                {item.name}
              </Link>
            ))}
            {showAdminNav && (
              <>
                <span className="mx-2 h-4 w-px bg-surface-border" />
                {adminNav.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                      pathname.startsWith(item.href)
                        ? "bg-brand-900/40 text-brand-300"
                        : "text-surface-muted hover:bg-surface-overlay hover:text-dark-100"
                    )}
                  >
                    {item.name}
                  </Link>
                ))}
              </>
            )}
          </nav>

          {/* Right side: notification bell + profile */}
          <div className="flex items-center gap-2 sm:gap-3">
            <NotificationBell profileId={profile.id} />
            <Link
              href={`/players/${profile.id}`}
              className="flex items-center gap-2 text-sm text-surface-muted hover:text-dark-100"
            >
              {profile.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt=""
                  className="h-8 w-8 rounded-full object-cover ring-2 ring-brand-500/20"
                />
              ) : (
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-900/50 text-brand-300 text-sm font-medium">
                  {profile.display_name?.charAt(0).toUpperCase()}
                </div>
              )}
              <span className="hidden sm:block">{profile.display_name}</span>
            </Link>
            <button
              onClick={handleSignOut}
              className="hidden md:block text-sm text-surface-muted hover:text-dark-200"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
