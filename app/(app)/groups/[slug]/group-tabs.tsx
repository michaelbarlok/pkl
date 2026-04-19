"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export type TabId = "overview" | "members" | "schedule" | "stats" | "forum";

export interface TabSpec {
  id: TabId;
  label: string;
  count?: number;
  href?: string; // if set, renders as a navigation link instead of a panel tab
}

/**
 * Sticky tab bar + panel shell for the group detail page.
 *
 * - The bar is always visible under the hero so you can hop between
 *   "what is this group" and "who's in it" without scrolling back up.
 * - Tabs live in ?tab=<id> so deep links and back/forward preserve state.
 *   Default is "overview". We only set initial state on mount to avoid an
 *   SSR/client hydration mismatch.
 * - Panels are all rendered (server-generated) and toggled via the `hidden`
 *   attribute. This keeps scroll anchors stable between tabs and means we
 *   don't need separate server roundtrips per click.
 * - The `tabs` list may include href-only entries (e.g. Forum) that route
 *   away instead of swapping panels.
 */
export function GroupTabs({
  tabs,
  children,
}: {
  tabs: TabSpec[];
  children: Partial<Record<TabId, React.ReactNode>>;
}) {
  const [active, setActive] = useState<TabId>(tabs[0]?.id ?? "overview");

  // Pull tab from the URL once we hydrate so `?tab=members` deep links work.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("tab");
    if (raw && tabs.some((t) => t.id === raw && !t.href)) {
      setActive(raw as TabId);
    }
  }, [tabs]);

  function selectTab(id: TabId) {
    setActive(id);
    const url = new URL(window.location.href);
    if (id === tabs[0]?.id) url.searchParams.delete("tab");
    else url.searchParams.set("tab", id);
    window.history.replaceState({}, "", url.toString());
  }

  return (
    <>
      <div
        role="tablist"
        aria-label="Group sections"
        className="sticky top-0 z-20 -mx-4 sm:mx-0 bg-dark-950/90 backdrop-blur supports-[backdrop-filter]:bg-dark-950/70 border-b border-surface-border"
      >
        <div className="flex gap-1 overflow-x-auto px-4 sm:px-0 py-1 scroll-smooth">
          {tabs.map((tab) => {
            const isActive = !tab.href && active === tab.id;
            const base =
              "shrink-0 inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50";
            if (tab.href) {
              return (
                <a
                  key={tab.id}
                  href={tab.href}
                  className={cn(base, "text-surface-muted hover:text-dark-100 hover:bg-surface-overlay/50")}
                >
                  {tab.label}
                  {typeof tab.count === "number" && (
                    <span className="text-xs text-surface-muted">{tab.count}</span>
                  )}
                  <svg className="h-3 w-3 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                  </svg>
                </a>
              );
            }
            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={isActive}
                aria-controls={`panel-${tab.id}`}
                id={`tab-${tab.id}`}
                onClick={() => selectTab(tab.id)}
                className={cn(
                  base,
                  isActive
                    ? "bg-brand-500/15 text-dark-100 ring-1 ring-brand-500/30"
                    : "text-surface-muted hover:text-dark-100 hover:bg-surface-overlay/50"
                )}
              >
                {tab.label}
                {typeof tab.count === "number" && (
                  <span
                    className={cn(
                      "text-xs",
                      isActive ? "text-brand-vivid" : "text-surface-muted"
                    )}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {tabs
        .filter((t) => !t.href)
        .map((tab) => (
          <div
            key={tab.id}
            id={`panel-${tab.id}`}
            role="tabpanel"
            aria-labelledby={`tab-${tab.id}`}
            hidden={active !== tab.id}
            className={active === tab.id ? "animate-tab-in" : ""}
          >
            {children[tab.id]}
          </div>
        ))}
    </>
  );
}
