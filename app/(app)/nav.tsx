"use client";

import { NotificationBell } from "@/components/notification-bell";
import { Logo } from "@/components/logo";
import { useSupabase } from "@/components/providers/supabase-provider";
import type { Profile } from "@/types/database";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

const playerNav = [
  { name: "Dashboard", href: "/dashboard" },
  { name: "Play", href: "/sessions/active" },
  { name: "Groups", href: "/groups" },
  { name: "Sheets", href: "/sheets" },
  { name: "Tournaments", href: "/tournaments" },
  { name: "Badges", href: "/badges" },
];

const adminNav = [
  { name: "Members", href: "/admin/members" },
  { name: "Sheets", href: "/admin/sheets" },
  { name: "Groups", href: "/admin/groups" },
  { name: "Sessions", href: "/admin/sessions" },
  { name: "Tournaments", href: "/admin/tournaments" },
];

export function AppNav({ profile, isGroupAdmin = false }: { profile: Profile; isGroupAdmin?: boolean }) {
  const pathname = usePathname();
  const { supabase } = useSupabase();
  const router = useRouter();
  const isAdmin = profile.role === "admin";
  const showAdminNav = isAdmin || isGroupAdmin;
  const [adminOpen, setAdminOpen] = useState(false);
  const adminRef = useRef<HTMLDivElement>(null);

  const isAdminRouteActive = pathname.startsWith("/admin");

  // Close dropdown on route change
  useEffect(() => {
    setAdminOpen(false);
  }, [pathname]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (adminRef.current && !adminRef.current.contains(e.target as Node)) {
        setAdminOpen(false);
      }
    }
    if (adminOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [adminOpen]);

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
            <Logo className="h-8 w-auto" />
          </Link>

          {/* Navigation */}
          <nav className="hidden md:flex items-center gap-0.5">
            {playerNav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  pathname === item.href || (item.href === "/sessions/active" && pathname.startsWith("/sessions/")) || (item.href === "/tournaments" && pathname.startsWith("/tournaments"))
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
                <div className="relative" ref={adminRef}>
                  <button
                    onClick={() => setAdminOpen(!adminOpen)}
                    aria-expanded={adminOpen}
                    aria-haspopup="true"
                    aria-label="Admin menu"
                    className={cn(
                      "flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                      isAdminRouteActive
                        ? "bg-brand-900/40 text-brand-300"
                        : "text-surface-muted hover:bg-surface-overlay hover:text-dark-100"
                    )}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                    </svg>
                    Admin
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={cn("h-4 w-4 transition-transform", adminOpen && "rotate-180")}>
                      <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                    </svg>
                  </button>
                  {adminOpen && (
                    <div className="absolute right-0 top-full mt-1 w-48 rounded-lg bg-surface-raised shadow-xl ring-1 ring-surface-border py-1 z-50">
                      {adminNav.map((item) => (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={cn(
                            "block px-4 py-2 text-sm font-medium transition-colors",
                            pathname.startsWith(item.href)
                              ? "bg-brand-900/40 text-brand-300"
                              : "text-dark-200 hover:bg-surface-overlay hover:text-dark-100"
                          )}
                        >
                          {item.name}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
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
              className="hidden md:block text-sm text-dark-300 hover:text-dark-100"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
