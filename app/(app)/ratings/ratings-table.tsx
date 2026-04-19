"use client";

import Link from "next/link";
import { DataTable, type Column } from "@/components/data-table";
import { PlayerAvatar } from "@/components/player-avatar";
import { formatDate } from "@/lib/utils";

export type RankedPlayer = {
  player_id: string;
  current_step: number;
  display_name: string;
  avatar_url: string | null;
  percentage: number;
  last_played_at: string | null;
};

export function RatingsTable({ ranked }: { ranked: RankedPlayer[] }) {
  // Add rank into each row so the cell renderer can use it without index bookkeeping.
  const withRank = ranked.map((r, i) => ({ ...r, rank: i + 1 }));

  const columns: Column<(typeof withRank)[number]>[] = [
    {
      key: "rank",
      header: "Rank",
      cell: (r) => <span className="text-surface-muted font-medium">#{r.rank}</span>,
      className: "w-16",
      priority: "primary",
    },
    {
      key: "player",
      header: "Player",
      cell: (r) => (
        <Link
          href={`/players/${r.player_id}`}
          className="flex items-center gap-3 hover:text-brand-300 min-w-0"
        >
          <PlayerAvatar displayName={r.display_name} avatarUrl={r.avatar_url} size="sm" />
          <span className="truncate font-medium text-dark-100">{r.display_name}</span>
        </Link>
      ),
      priority: "primary",
    },
    {
      key: "step",
      header: "Step",
      cell: (r) => <span className="status-upcoming">Step {r.current_step}</span>,
      sortValue: (r) => r.current_step,
      sortable: true,
      align: "right",
      priority: "primary",
    },
    {
      key: "pct",
      header: "Pt %",
      cell: (r) => (r.percentage > 0 ? `${r.percentage.toFixed(1)}%` : "—"),
      sortValue: (r) => r.percentage,
      sortable: true,
      align: "right",
      priority: "primary",
    },
    {
      key: "last_played",
      header: "Last Played",
      cell: (r) => (r.last_played_at ? formatDate(r.last_played_at) : "—"),
      sortValue: (r) => r.last_played_at ?? "",
      sortable: true,
      align: "right",
      priority: "tertiary",
    },
  ];

  return (
    <DataTable
      data={withRank}
      columns={columns}
      keyFn={(r) => r.player_id}
      caption="Ranked players by step and scoring percentage"
      empty={{
        title: "No ranked players yet",
        description: "Rankings populate as sessions complete.",
      }}
    />
  );
}
