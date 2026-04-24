"use client";

import { useSupabase } from "@/components/providers/supabase-provider";
import { FeedbackButton } from "@/components/feedback-button";
import type { Profile } from "@/types/database";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { cn } from "@/lib/utils";

/**
 * Returns true when the viewer has something live to play — an
 * active shootout they're checked into, an active free-play session,
 * or an in-progress tournament division they're registered in.
 * Used by the bottom nav to pulse the Play tab as a subtle cue.
 *
 * Re-checks on route change + window focus so the cue dismisses
 * without a hard refresh once the viewer taps Play. Cheap: three
 * small PostgREST queries gated by profile id.
 */
function useHasActivePlay(profileId: string): boolean {
  const { supabase } = useSupabase();
  const pathname = usePathname();
  const [hasActive, setHasActive] = useState(false);

  const check = useCallback(async () => {
    // Active shootout (ladder) session the viewer is checked into.
    const { data: shootout } = await supabase
      .from("session_participants")
      .select("session:shootout_sessions(id, status)")
      .eq("player_id", profileId)
      .eq("checked_in", true)
      .limit(10);
    if (
      (shootout ?? []).some((p: any) => {
        const s = p.session?.status;
        return s && !["session_complete", "created"].includes(s);
      })
    ) {
      setHasActive(true);
      return;
    }

    // Active free-play session the viewer is checked into.
    const { data: freePlay } = await supabase
      .from("free_play_session_players")
      .select("session:free_play_sessions!inner(id, status)")
      .eq("player_id", profileId)
      .limit(10);
    if (
      (freePlay ?? []).some((r: any) => r.session?.status === "active")
    ) {
      setHasActive(true);
      return;
    }

    // In-progress tournament with a division the viewer is in.
    // Mirrors the Play-tab routing in /sessions/active/page.tsx.
    const { data: regs } = await supabase
      .from("tournament_registrations")
      .select("tournament_id, division, status, tournament:tournaments(status)")
      .or(`player_id.eq.${profileId},partner_id.eq.${profileId}`)
      .neq("status", "withdrawn");
    const candidate = (regs ?? []).find(
      (r: any) => r.tournament?.status === "in_progress"
    ) as any;
    if (candidate) {
      const { data: active } = await supabase
        .from("tournament_active_divisions")
        .select("division")
        .eq("tournament_id", candidate.tournament_id)
        .eq("division", candidate.division)
        .maybeSingle();
      if (active) {
        setHasActive(true);
        return;
      }
    }

    setHasActive(false);
  }, [supabase, profileId]);

  // Re-check on route change — covers both fresh page loads and
  // client-side navigations (the layout server component is
  // cached so it won't recompute on its own).
  useEffect(() => {
    check();
  }, [check, pathname]);

  // Re-check when the tab gains focus — catches the "phone was
  // backgrounded, session started in the meantime" case without
  // needing a realtime subscription here.
  useEffect(() => {
    function onFocus() {
      check();
    }
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") check();
    });
    return () => {
      window.removeEventListener("focus", onFocus);
    };
  }, [check]);

  return hasActive;
}

const mainTabs = [
  {
    name: "Home",
    href: "/dashboard",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
      </svg>
    ),
  },
  {
    name: "Sheets",
    href: "/sheets",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15a2.25 2.25 0 0 1 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z" />
      </svg>
    ),
  },
  {
    name: "Play",
    href: "/sessions/active",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" />
      </svg>
    ),
  },
  {
    name: "Groups",
    href: "/groups",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
      </svg>
    ),
  },
];

const moreMenuPlayerLinks = [
  {
    name: "My Sessions",
    href: "/my-sessions",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
      </svg>
    ),
  },
  {
    name: "Badges",
    href: "/badges",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.006 5.404.434c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.434 2.082-5.005Z" />
      </svg>
    ),
  },
  {
    name: "Tournaments",
    href: "/tournaments",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 0 1 3 3h-15a3 3 0 0 1 3-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 0 1-.982-3.172M9.497 14.25a7.454 7.454 0 0 0 .981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 0 0 7.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M18.75 4.236c.982.143 1.954.317 2.916.52A6.003 6.003 0 0 1 16.27 9.728M18.75 4.236V4.5c0 2.108-.966 3.99-2.48 5.228m0 0a6.023 6.023 0 0 1-2.77.672c-.99 0-1.926-.228-2.77-.672" />
      </svg>
    ),
  },
  {
    name: "Forum",
    href: "/forum",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 0 1-.825-.242m9.345-8.334a2.126 2.126 0 0 0-.476-.095 48.64 48.64 0 0 0-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0 0 11.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" />
      </svg>
    ),
  },
  {
    name: "Notifications",
    href: "/notifications",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
      </svg>
    ),
  },
];

const adminLinks = [
  {
    name: "Members",
    href: "/admin/members",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
      </svg>
    ),
  },
  {
    name: "Manage Sheets",
    href: "/admin/sheets",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
      </svg>
    ),
  },
  {
    name: "Manage Groups",
    href: "/admin/groups",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75" />
      </svg>
    ),
  },
  {
    name: "Tournaments",
    href: "/admin/tournaments",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 0 1 3 3h-15a3 3 0 0 1 3-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 0 1-.982-3.172M9.497 14.25a7.454 7.454 0 0 0 .981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 0 0 7.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M18.75 4.236c.982.143 1.954.317 2.916.52A6.003 6.003 0 0 1 16.27 9.728M18.75 4.236V4.5c0 2.108-.966 3.99-2.48 5.228m0 0a6.023 6.023 0 0 1-2.77.672c-.99 0-1.926-.228-2.77-.672" />
      </svg>
    ),
  },
  {
    name: "Sessions",
    href: "/admin/sessions",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
      </svg>
    ),
  },
];

export function MobileNav({ profile, isGroupAdmin = false }: { profile: Profile; isGroupAdmin?: boolean }) {
  const pathname = usePathname();
  const { supabase } = useSupabase();
  const router = useRouter();
  const isAdmin = profile.role === "admin";
  const showAdminNav = isAdmin || isGroupAdmin;
  const [moreOpen, setMoreOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Pulse the Play tab when the viewer has something live to join,
  // but stop pulsing once they're viewing it — mirrors the Sign Up
  // button's pulse on the sheet detail page.
  const hasActivePlay = useHasActivePlay(profile.id);
  const viewingActivePlay = useMemo(() => {
    // Any "I'm on my live session / tournament" route. Covers the
    // Play-tab redirect hub itself plus every destination it
    // bounces to (ladder session, free-play manager, tournament
    // live view).
    if (!pathname) return false;
    if (pathname.startsWith("/sessions/active")) return true;
    if (/^\/sessions\/[^/]+(?:\/|$)/.test(pathname)) return true;
    if (/^\/tournaments\/[^/]+\/live(?:\/|$)/.test(pathname)) return true;
    if (/^\/groups\/[^/]+\/session(?:\/|$)/.test(pathname)) return true;
    return false;
  }, [pathname]);
  const playShouldPulse = hasActivePlay && !viewingActivePlay;

  // Focus trap when menu is open
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") {
      setMoreOpen(false);
      return;
    }
    if (e.key !== "Tab" || !menuRef.current) return;

    const focusable = menuRef.current.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }, []);

  useEffect(() => {
    if (moreOpen) {
      document.addEventListener("keydown", handleKeyDown);
      // Focus first link in menu
      setTimeout(() => {
        menuRef.current?.querySelector<HTMLElement>("a, button")?.focus();
      }, 100);
    } else {
      document.removeEventListener("keydown", handleKeyDown);
    }
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [moreOpen, handleKeyDown]);

  // Close menu on route change
  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  // Prevent body scroll when menu is open
  useEffect(() => {
    if (moreOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [moreOpen]);

  async function handleSignOut() {
    setMoreOpen(false);
    await supabase.auth.signOut();
    router.push("/login");
  }

  const isMoreActive =
    pathname.startsWith("/badges") ||
    pathname.startsWith("/forum") ||
    pathname.startsWith("/notifications") ||
    pathname.startsWith("/tournaments") ||
    pathname.startsWith("/admin");

  return (
    <>
      {/* Backdrop */}
      {moreOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setMoreOpen(false)}
        />
      )}

      {/* More menu slide-up panel */}
      <div
        className={cn(
          // bottom offset = tab-bar height (h-14) + iOS home-indicator
          // safe-area. Without the env() term the menu slides behind
          // the tab bar in installed-PWA mode on iPhone, hiding the
          // Sign Out button at the bottom of the list.
          "fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-50 md:hidden transform transition-transform duration-200 ease-out",
          moreOpen ? "translate-y-0" : "translate-y-full"
        )}
      >
        <div
          ref={menuRef}
          // Cap the height so tall menus (admin sees lots of rows)
          // stay scrollable on short viewports instead of overflowing
          // the top of the screen.
          className="mx-2 mb-1 rounded-xl bg-surface-raised shadow-2xl ring-1 ring-surface-border overflow-y-auto max-h-[calc(100dvh-6rem-env(safe-area-inset-bottom))]"
        >
          {/* Profile header */}
          <div className="flex items-center gap-3 border-b border-surface-border px-4 py-3">
            {profile.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt=""
                className="h-9 w-9 rounded-full object-cover ring-2 ring-brand-500/30"
              />
            ) : (
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-900/50 text-brand-300 text-sm font-medium">
                {profile.display_name?.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-dark-100 truncate">
                {profile.display_name}
              </p>
              <Link
                href={`/players/${profile.id}`}
                className="text-xs text-brand-400"
                onClick={() => setMoreOpen(false)}
              >
                View profile
              </Link>
            </div>
          </div>

          {/* Player links */}
          <div className="py-1">
            {moreMenuPlayerLinks.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors",
                  pathname.startsWith(item.href)
                    ? "bg-brand-900/40 text-brand-300"
                    : "text-dark-200 hover:bg-surface-overlay active:bg-surface-overlay"
                )}
              >
                {item.icon}
                {item.name}
              </Link>
            ))}
          </div>

          {/* Admin section */}
          {showAdminNav && (
            <>
              <div className="border-t border-surface-border">
                <p className="px-4 pt-2.5 pb-1 text-xs font-semibold uppercase tracking-wider text-surface-muted">
                  Admin
                </p>
                {adminLinks.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors",
                      pathname.startsWith(item.href)
                        ? "bg-brand-900/40 text-brand-300"
                        : "text-dark-200 hover:bg-surface-overlay active:bg-surface-overlay"
                    )}
                  >
                    {item.icon}
                    {item.name}
                  </Link>
                ))}
              </div>
            </>
          )}

          {/* Invite + Suggest + Sign out */}
          <div className="border-t border-surface-border py-1">
            <InviteButton displayName={profile.display_name} onDone={() => setMoreOpen(false)} />
            <FeedbackButton onDone={() => setMoreOpen(false)} />
            <button
              onClick={handleSignOut}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-sm font-medium text-dark-200 active:bg-surface-overlay"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" />
              </svg>
              Sign out
            </button>
          </div>
        </div>
      </div>

      {/* Bottom tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-surface-border bg-surface md:hidden">
        <div className="flex items-center justify-around">
          {mainTabs.map((tab) => {
            const active =
              tab.href === "/"
                ? pathname === "/"
                : pathname.startsWith(tab.href);
            const pulse = tab.name === "Play" && playShouldPulse;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  "flex flex-1 flex-col items-center pt-2 pb-1.5 text-xs font-medium transition-colors",
                  active || pulse ? "text-brand-400" : "text-dark-300 active:text-dark-100"
                )}
              >
                <span
                  className={cn(
                    "relative mb-0.5 flex items-center justify-center rounded-2xl px-5 py-0.5 transition-colors overflow-hidden",
                    active && "bg-brand-500/15",
                    pulse && !active && "bg-brand-500/15"
                  )}
                >
                  {/* Pulse behind the icon — overflow-hidden on the
                      parent clips animate-ping's outward scale to the
                      pill's bounds, so the effect reads as a subtle
                      fill-fade and never spills above the nav strip. */}
                  {pulse && (
                    <span
                      className="pointer-events-none absolute inset-0 rounded-2xl bg-brand-400 opacity-40 animate-ping"
                      aria-hidden
                    />
                  )}
                  <span className="relative">{tab.icon}</span>
                </span>
                <span>{tab.name}</span>
              </Link>
            );
          })}
          {/* More button */}
          <button
            onClick={() => setMoreOpen(!moreOpen)}
            className={cn(
              "flex flex-1 flex-col items-center pt-2 pb-1.5 text-xs font-medium transition-colors",
              moreOpen || isMoreActive ? "text-brand-400" : "text-dark-300 active:text-dark-100"
            )}
          >
            <span
              className={cn(
                "mb-0.5 flex items-center justify-center rounded-2xl px-5 py-0.5 transition-colors",
                (moreOpen || isMoreActive) && "bg-brand-500/15"
              )}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
              </svg>
            </span>
            <span>More</span>
          </button>
        </div>
        {/* Safe area for phones with home indicator */}
        <div className="h-[env(safe-area-inset-bottom)] bg-surface" />
      </nav>
    </>
  );
}

function InviteButton({ displayName, onDone }: { displayName: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false);

  async function handleInvite() {
    const inviteUrl = `${window.location.origin}/register`;
    const text = `${displayName} invited you to join Tri-Star Pickleball — a pickleball community for ladder leagues, tournaments, and more. Sign up here:`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: "Join Tri-Star Pickleball",
          text,
          url: inviteUrl,
        });
        onDone();
      } catch (err) {
        // User cancelled share — do nothing
        if ((err as Error).name !== "AbortError") {
          console.error("Share failed:", err);
        }
      }
    } else {
      // Fallback: copy link to clipboard
      try {
        await navigator.clipboard.writeText(inviteUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        // Last resort: prompt
        window.prompt("Copy this invite link:", inviteUrl);
      }
    }
  }

  return (
    <button
      onClick={handleInvite}
      className="flex w-full items-center gap-3 px-4 py-2.5 text-sm font-medium text-brand-400 active:bg-surface-overlay"
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M18 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0ZM3 19.235v-.11a6.375 6.375 0 0 1 12.75 0v.109A12.318 12.318 0 0 1 9.374 21c-2.331 0-4.512-.645-6.374-1.766Z" />
      </svg>
      {copied ? "Link copied!" : "Invite a Player"}
    </button>
  );
}
