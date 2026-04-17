"use client";

import { useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/empty-state";

const DAY_NAMES_FULL = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];

function fmt12h(time: string) {
  const [hStr, mStr] = time.split(":");
  const h = parseInt(hStr, 10);
  return `${h === 0 ? 12 : h > 12 ? h - 12 : h}:${mStr} ${h >= 12 ? "pm" : "am"}`;
}

function formatPlayTime(pt: GroupCardData["playTime"], tz: string): string {
  if (!pt) return "";
  const localTime = fmt12h(pt.event_time.slice(0, 5));
  // Derive short TZ abbreviation
  const tzAbbr = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "short" })
    .formatToParts(new Date())
    .find((p) => p.type === "timeZoneName")?.value ?? "";
  return `${DAY_NAMES_FULL[pt.day_of_week]} · ${localTime} ${tzAbbr}`;
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

export function GroupList({
  groups,
  playerId,
  joinAction,
}: {
  groups: GroupCardData[];
  playerId: string | null;
  joinAction: (groupId: string, groupType: string) => Promise<void>;
}) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const filtered = groups.filter((g) => {
    const matchesSearch =
      !search ||
      g.name.toLowerCase().includes(search.toLowerCase()) ||
      g.description?.toLowerCase().includes(search.toLowerCase()) ||
      g.city?.toLowerCase().includes(search.toLowerCase()) ||
      g.state?.toLowerCase().includes(search.toLowerCase());

    const matchesType =
      typeFilter === "all" || g.group_type === typeFilter;

    return matchesSearch && matchesType;
  });

  return (
    <>
      {/* Search & Filters */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-muted" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            type="text"
            placeholder="Search groups..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input pl-10 w-full"
          />
        </div>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="input w-full sm:w-auto">
          <option value="all">All Types</option>
          <option value="ladder_league">Ladder</option>
          <option value="free_play">Free Play</option>
        </select>
      </div>

      {(search || typeFilter !== "all") && (
        <p className="text-sm text-surface-muted">
          Showing {filtered.length} of {groups.length} groups
        </p>
      )}

      {filtered.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((group) => (
            <div
              key={group.id}
              className={cn(
                "card flex flex-col transition-shadow hover:ring-brand-500/30",
                group.isJoined ? "card-accent-brand ring-brand-500/30" : "card-accent-gray"
              )}
            >
              <Link href={`/groups/${group.slug}`} className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-dark-100">{group.name}</h3>
                  <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                    <span className={group.group_type === "free_play" ? "badge-yellow" : "badge-blue"}>
                      {group.group_type === "free_play" ? "Free Play" : "Ladder"}
                    </span>
                    <span className={group.visibility === "private" ? "badge-gray" : "badge-green"}>
                      {group.visibility === "private" ? "Private" : "Public"}
                    </span>
                    {group.isJoined && <span className="badge-green">Joined</span>}
                  </div>
                </div>

                {(group.city || group.state) && (
                  <p className="mt-1 text-xs text-surface-muted">
                    {[group.city, group.state].filter(Boolean).join(", ")}
                  </p>
                )}

                {/* Play Time */}
                {group.playTime && (
                  <div className="mt-2 space-y-0.5">
                    <div className="flex items-center gap-1.5 text-xs text-brand-vivid font-medium">
                      <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z" />
                      </svg>
                      {formatPlayTime(group.playTime, group.playTime.timezone)}
                    </div>
                    {group.playTime.location && (
                      <div className="flex items-center gap-1.5 text-xs text-surface-muted">
                        <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                        </svg>
                        <span className="truncate">{group.playTime.location}</span>
                      </div>
                    )}
                  </div>
                )}

                {group.description && (
                  <p className="mt-2 text-sm text-surface-muted line-clamp-2">
                    {group.description}
                  </p>
                )}

                <div className="mt-3 flex items-center gap-2 text-sm text-surface-muted">
                  <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                  </svg>
                  <span>{group.memberCount} {group.memberCount === 1 ? "member" : "members"}</span>
                </div>
              </Link>

              {!group.isJoined && group.visibility === "public" && playerId && (
                <form
                  action={async () => { await joinAction(group.id, group.group_type); }}
                  className="mt-3 border-t border-surface-border pt-3"
                >
                  <button type="submit" className="btn-primary w-full text-sm">Join Group</button>
                </form>
              )}
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          title={search || typeFilter !== "all" ? "No groups match your search" : "No active groups available"}
          description={search || typeFilter !== "all" ? "Try adjusting your search or filters." : "Create a group to get started."}
        />
      )}
    </>
  );
}
