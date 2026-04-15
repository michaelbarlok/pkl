"use client";

import { NotificationBell } from "@/components/notification-bell";
import { ThemeToggle } from "@/components/theme-toggle";
import { Logo } from "@/components/logo";
import { useSupabase } from "@/components/providers/supabase-provider";
import type { Profile } from "@/types/database";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

interface NavEntry {
  name: string;
  href: string;
  icon: React.ReactNode;
  match: (pathname: string) => boolean;
}

const playerNav: NavEntry[] = [
  {
    name: "Dashboard",
    href: "/dashboard",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5 shrink-0">
        <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
      </svg>
    ),
    match: (p) => p === "/dashboard",
  },
  {
    name: "Sheets",
    href: "/sheets",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5 shrink-0">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15a2.25 2.25 0 0 1 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z" />
      </svg>
    ),
    match: (p) => p.startsWith("/sheets"),
  },
  {
    name: "Play",
    href: "/sessions/active",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5 shrink-0">
        <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" />
      </svg>
    ),
    match: (p) => p.startsWith("/sessions/"),
  },
  {
    name: "Groups",
    href: "/groups",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5 shrink-0">
        <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
      </svg>
    ),
    match: (p) => p.startsWith("/groups"),
  },
  {
    name: "Tournaments",
    href: "/tournaments",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5 shrink-0">
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 0 1 3 3h-15a3 3 0 0 1 3-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 0 1-.982-3.172M9.497 14.25a7.454 7.454 0 0 0 .981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 0 0 7.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M18.75 4.236c.982.143 1.954.317 2.916.52A6.003 6.003 0 0 1 16.27 9.728M18.75 4.236V4.5c0 2.108-.966 3.99-2.48 5.228m0 0a6.023 6.023 0 0 1-2.77.672c-.99 0-1.926-.228-2.77-.672" />
      </svg>
    ),
    match: (p) => p.startsWith("/tournaments"),
  },
  {
    name: "Badges",
    href: "/badges",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5 shrink-0">
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.006 5.404.434c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.434 2.082-5.005Z" />
      </svg>
    ),
    match: (p) => p.startsWith("/badges"),
  },
  {
    name: "Forum",
    href: "/forum",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5 shrink-0">
        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 0 1-.825-.242m9.345-8.334a2.126 2.126 0 0 0-.476-.095 48.64 48.64 0 0 0-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0 0 11.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" />
      </svg>
    ),
    match: (p) => p.startsWith("/forum"),
  },
];

const adminNav: NavEntry[] = [
  {
    name: "Members",
    href: "/admin/members",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5 shrink-0">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
      </svg>
    ),
    match: (p) => p.startsWith("/admin/members"),
  },
  {
    name: "Sheets",
    href: "/admin/sheets",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5 shrink-0">
        <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
      </svg>
    ),
    match: (p) => p.startsWith("/admin/sheets"),
  },
  {
    name: "Manage Groups",
    href: "/admin/groups",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5 shrink-0">
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75" />
      </svg>
    ),
    match: (p) => p.startsWith("/admin/groups"),
  },
  {
    name: "Sessions",
    href: "/admin/sessions",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5 shrink-0">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
      </svg>
    ),
    match: (p) => p.startsWith("/admin/sessions"),
  },
  {
    name: "Tournaments",
    href: "/admin/tournaments",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5 shrink-0">
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 0 1 3 3h-15a3 3 0 0 1 3-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 0 1-.982-3.172M9.497 14.25a7.454 7.454 0 0 0 .981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 0 0 7.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M18.75 4.236c.982.143 1.954.317 2.916.52A6.003 6.003 0 0 1 16.27 9.728M18.75 4.236V4.5c0 2.108-.966 3.99-2.48 5.228m0 0a6.023 6.023 0 0 1-2.77.672c-.99 0-1.926-.228-2.77-.672" />
      </svg>
    ),
    match: (p) => p.startsWith("/admin/tournaments"),
  },
];

interface SidebarProps {
  profile: Profile;
  isGroupAdmin?: boolean;
}

export function Sidebar({ profile, isGroupAdmin = false }: SidebarProps) {
  const pathname = usePathname();
  const { supabase } = useSupabase();
  const router = useRouter();
  const showAdminNav = profile.role === "admin" || isGroupAdmin;

  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("sidebar-collapsed");
    if (stored !== null) setCollapsed(stored === "true");
  }, []);

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem("sidebar-collapsed", String(next));
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <aside
      className={cn(
        "hidden md:flex flex-col h-screen sticky top-0 shrink-0 border-r border-surface-border bg-gradient-to-b from-dark-800 to-dark-950 transition-[width] duration-200 ease-in-out overflow-hidden",
        collapsed ? "w-14" : "w-56"
      )}
    >
      {/* Logo + collapse toggle */}
      <div
        className={cn(
          "flex items-center border-b border-surface-border h-14 shrink-0",
          collapsed ? "justify-center" : "justify-between px-3"
        )}
      >
        {collapsed ? (
          <Link href="/">
            <Logo className="h-8 w-8 object-contain shrink-0" />
          </Link>
        ) : (
          <Link href="/" className="flex items-center gap-2 min-w-0">
            <Logo className="h-7 w-auto shrink-0" />
          </Link>
        )}
        <button
          onClick={toggleCollapsed}
          className="flex h-8 w-8 items-center justify-center rounded-md text-surface-muted hover:bg-surface-overlay hover:text-dark-100 transition-colors shrink-0"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
          )}
        </button>
      </div>

      {/* Scrollable nav */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-2">
        <ul className="space-y-0.5 px-2">
          {playerNav.map((item) => (
            <li key={item.href}>
              <NavItem
                href={item.href}
                label={item.name}
                icon={item.icon}
                active={item.match(pathname)}
                collapsed={collapsed}
              />
            </li>
          ))}
        </ul>

        {showAdminNav && (
          <div className="mt-3">
            {collapsed ? (
              <div className="mx-2 mb-1 h-px bg-surface-border" />
            ) : (
              <p className="px-4 mb-1 text-[10px] font-semibold uppercase tracking-widest text-surface-muted">
                Admin
              </p>
            )}
            <ul className="space-y-0.5 px-2">
              {adminNav.map((item) => (
                <li key={item.href}>
                  <NavItem
                    href={item.href}
                    label={item.name}
                    icon={item.icon}
                    active={item.match(pathname)}
                    collapsed={collapsed}
                  />
                </li>
              ))}
            </ul>
          </div>
        )}
      </nav>

      {/* Bottom: notifications + profile + sign out */}
      <div className="shrink-0 border-t border-surface-border py-2 px-2 space-y-0.5">
        <div
          className={cn(
            "flex items-center rounded-md px-2 py-1.5 text-surface-muted hover:bg-surface-overlay hover:text-dark-100 transition-colors",
            collapsed && "justify-center px-0"
          )}
        >
          <NotificationBell profileId={profile.id} />
          {!collapsed && (
            <span className="ml-2 text-sm font-medium">Notifications</span>
          )}
        </div>

        <Link
          href={`/players/${profile.id}`}
          title={collapsed ? profile.display_name : undefined}
          className={cn(
            "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-surface-muted hover:bg-surface-overlay hover:text-dark-100 transition-colors",
            collapsed && "justify-center px-0"
          )}
        >
          {profile.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt=""
              className="h-7 w-7 rounded-full object-cover ring-2 ring-brand-500/20 shrink-0"
            />
          ) : (
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-900/50 text-brand-300 text-xs font-medium shrink-0">
              {profile.display_name?.charAt(0).toUpperCase()}
            </div>
          )}
          {!collapsed && (
            <span className="truncate font-medium">{profile.display_name}</span>
          )}
        </Link>

        <ThemeToggle collapsed={collapsed} />

        <button
          onClick={handleSignOut}
          title={collapsed ? "Sign out" : undefined}
          className={cn(
            "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-surface-muted hover:bg-surface-overlay hover:text-dark-100 transition-colors",
            collapsed && "justify-center px-0"
          )}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5 shrink-0">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" />
          </svg>
          {!collapsed && <span>Sign out</span>}
        </button>
      </div>
    </aside>
  );
}

function NavItem({
  href,
  label,
  icon,
  active,
  collapsed,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
  active: boolean;
  collapsed: boolean;
}) {
  return (
    <Link
      href={href}
      title={collapsed ? label : undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm font-medium transition-colors",
        collapsed && "justify-center w-10 mx-auto px-0",
        active
          ? "bg-brand-500/20 text-brand-300 shadow-[inset_2px_0_0_#2dd4c5]"
          : "text-dark-200 hover:bg-surface-overlay hover:text-dark-100"
      )}
    >
      {icon}
      {!collapsed && <span className="truncate">{label}</span>}
    </Link>
  );
}
