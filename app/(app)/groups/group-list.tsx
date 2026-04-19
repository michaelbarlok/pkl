"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/empty-state";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function fmt12h(time: string) {
  const [hStr, mStr] = time.split(":");
  const h = parseInt(hStr, 10);
  return `${h === 0 ? 12 : h > 12 ? h - 12 : h}:${mStr} ${h >= 12 ? "pm" : "am"}`;
}

function formatPlayTime(pt: GroupCardData["playTime"]): string {
  if (!pt) return "";
  const localTime = fmt12h(pt.event_time.slice(0, 5));
  const tzAbbr =
    new Intl.DateTimeFormat("en-US", { timeZone: pt.timezone, timeZoneName: "short" })
      .formatToParts(new Date())
      .find((p) => p.type === "timeZoneName")?.value ?? "";
  return `${DAY_NAMES[pt.day_of_week]} · ${localTime} ${tzAbbr}`;
}

export interface GroupCardData {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  group_type: string;
  visibility: string;
  city: string | null;
  state: string | null;
  memberCount: number;
  isJoined: boolean;
  playTime: {
    day_of_week: number;
    event_time: string;
    timezone: string;
    location: string;
  } | null;
}

type Tab = "mine" | "search";

export function GroupList({
  groups,
  playerId,
  joinAction,
}: {
  groups: GroupCardData[];
  playerId: string | null;
  joinAction: (groupId: string, groupType: string) => Promise<void>;
}) {
  const [tab, setTab] = useState<Tab>("mine");
  const [search, setSearch] = useState("");
  const [location, setLocation] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const { mine, discoverable } = useMemo(() => {
    const mine: GroupCardData[] = [];
    const discoverable: GroupCardData[] = [];
    for (const g of groups) {
      if (g.isJoined) mine.push(g);
      else if (g.visibility === "public") discoverable.push(g);
    }
    return { mine, discoverable };
  }, [groups]);

  const filteredSearch = useMemo(() => {
    const s = search.trim().toLowerCase();
    const loc = location.trim().toLowerCase();
    return discoverable.filter((g) => {
      const matchesSearch =
        !s ||
        g.name.toLowerCase().includes(s) ||
        g.description?.toLowerCase().includes(s);
      const matchesLocation =
        !loc ||
        g.city?.toLowerCase().includes(loc) ||
        g.state?.toLowerCase().includes(loc) ||
        `${g.city ?? ""}, ${g.state ?? ""}`.toLowerCase().includes(loc);
      const matchesType = typeFilter === "all" || g.group_type === typeFilter;
      return matchesSearch && matchesLocation && matchesType;
    });
  }, [discoverable, search, location, typeFilter]);

  const activeList = tab === "mine" ? mine : filteredSearch;
  const hasFilters = tab === "search" && (search || location || typeFilter !== "all");

  return (
    <>
      {/* Tabs */}
      <div className="border-b border-surface-border">
        <nav className="-mb-px flex gap-6">
          <button
            type="button"
            onClick={() => setTab("mine")}
            className={cn(
              "py-2.5 text-sm font-medium transition-colors",
              tab === "mine"
                ? "border-b-2 border-brand-500 text-brand-300"
                : "text-surface-muted hover:text-dark-200"
            )}
          >
            My Groups{mine.length > 0 ? ` (${mine.length})` : ""}
          </button>
          <button
            type="button"
            onClick={() => setTab("search")}
            className={cn(
              "py-2.5 text-sm font-medium transition-colors",
              tab === "search"
                ? "border-b-2 border-brand-500 text-brand-300"
                : "text-surface-muted hover:text-dark-200"
            )}
          >
            Search for Groups
          </button>
        </nav>
      </div>

      {/* Filters — only on the Search tab */}
      {tab === "search" && (
        <>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <div className="relative">
              <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-muted" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
              <input
                type="text"
                placeholder="Search by name"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="input pl-10 w-full"
              />
            </div>
            <input
              type="text"
              placeholder="City or state"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="input w-full"
            />
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="input w-full sm:w-auto"
            >
              <option value="all">All Types</option>
              <option value="ladder_league">Ladder</option>
              <option value="free_play">Free Play</option>
            </select>
          </div>

          {hasFilters && (
            <p className="text-sm text-surface-muted">
              Showing {filteredSearch.length} of {discoverable.length} groups
            </p>
          )}
        </>
      )}

      {/* Group grid */}
      {activeList.length > 0 ? (
        <div className="grid grid-cols-1 gap-2 sm:gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {activeList.map((group) => (
            <GroupCard
              key={group.id}
              group={group}
              showVisibility={tab === "mine"}
              showJoinButton={tab === "search" && !!playerId}
              onJoin={joinAction}
            />
          ))}
        </div>
      ) : tab === "mine" ? (
        <div className="card text-center py-10 space-y-3">
          <p className="font-medium text-dark-100">You haven&apos;t joined any groups yet</p>
          <p className="text-sm text-surface-muted">Switch to the Search tab to find one.</p>
          <button
            type="button"
            onClick={() => setTab("search")}
            className="inline-block text-sm font-medium text-brand-400 hover:text-brand-300"
          >
            Search for Groups →
          </button>
        </div>
      ) : (
        <EmptyState
          title={hasFilters ? "No groups match your filters" : "No public groups available"}
          description={hasFilters ? "Try adjusting your search or filters." : "Check back later, or create one."}
        />
      )}
    </>
  );
}

function GroupCard({
  group,
  showVisibility,
  showJoinButton,
  onJoin,
}: {
  group: GroupCardData;
  showVisibility: boolean;
  showJoinButton: boolean;
  onJoin: (groupId: string, groupType: string) => Promise<void>;
}) {
  const cityState = [group.city, group.state].filter(Boolean).join(", ");
  const playTimeStr = group.playTime ? formatPlayTime(group.playTime) : null;

  return (
    <div
      className={cn(
        "card p-3 sm:p-4 flex flex-col transition-shadow hover:ring-brand-500/30",
        group.isJoined ? "card-accent-brand ring-brand-500/30" : "card-accent-gray"
      )}
    >
      <Link href={`/groups/${group.slug}`} className="flex-1 min-w-0">
        {/* Header: name + type (+ optional visibility) */}
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-dark-100 text-sm sm:text-base leading-tight">
            {group.name}
          </h3>
          <div className="flex flex-wrap items-center gap-1 shrink-0">
            <span className={group.group_type === "free_play" ? "badge-yellow" : "badge-blue"}>
              {group.group_type === "free_play" ? "Free Play" : "Ladder"}
            </span>
            {showVisibility && group.visibility === "private" && (
              <span className="badge-gray">Private</span>
            )}
          </div>
        </div>

        {/* Location · members (one line) */}
        <p className="mt-1 text-xs text-surface-muted">
          {cityState && <span>{cityState} · </span>}
          {group.memberCount} {group.memberCount === 1 ? "member" : "members"}
        </p>

        {/* Play time (one line) */}
        {playTimeStr && (
          <p className="mt-1 text-xs text-brand-vivid font-medium flex items-center gap-1 min-w-0">
            <svg className="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z" />
            </svg>
            <span className="truncate">
              {playTimeStr}
              {group.playTime?.location ? ` · ${group.playTime.location}` : ""}
            </span>
          </p>
        )}

        {/* Description */}
        {group.description && (
          <p className="mt-1 text-xs text-surface-muted line-clamp-1 sm:line-clamp-2">
            {group.description}
          </p>
        )}
      </Link>

      {showJoinButton && !group.isJoined && group.visibility === "public" && (
        <form
          action={async () => {
            await onJoin(group.id, group.group_type);
          }}
          className="mt-2 border-t border-surface-border pt-2"
        >
          <button type="submit" className="btn-primary w-full text-xs py-1.5">
            Join Group
          </button>
        </form>
      )}
    </div>
  );
}
