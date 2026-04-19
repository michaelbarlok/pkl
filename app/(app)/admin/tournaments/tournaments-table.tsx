"use client";

import { AdminDeleteButton } from "@/components/delete-tournament-button";
import { HideTournamentToggle } from "./hide-toggle";
import { DataTable, type Column } from "@/components/data-table";
import { EmptyIllustrationTrophy } from "@/components/empty-state";
import Link from "next/link";
import { formatDate } from "@/lib/utils";
import { TOURNAMENT_STATUS_COLORS, TOURNAMENT_STATUS_LABELS } from "@/lib/status-colors";

export type TournamentRow = {
  id: string;
  title: string;
  start_date: string | null;
  status: string;
  player_cap: number | null;
  is_hidden: boolean | null;
  creator: { display_name: string | null } | null;
  registrations: { count: number }[] | null;
};

export function TournamentsTable({ tournaments }: { tournaments: TournamentRow[] }) {
  const columns: Column<TournamentRow>[] = [
    {
      key: "title",
      header: "Title",
      cell: (t) => (
        <Link href={`/tournaments/${t.id}`} className="font-medium text-dark-100 hover:text-brand-300">
          {t.title}
        </Link>
      ),
      sortValue: (t) => t.title.toLowerCase(),
      sortable: true,
      priority: "primary",
    },
    {
      key: "date",
      header: "Date",
      cell: (t) => (t.start_date ? formatDate(t.start_date + "T00:00:00") : "—"),
      sortValue: (t) => t.start_date ?? "",
      sortable: true,
      priority: "primary",
    },
    {
      key: "status",
      header: "Status",
      cell: (t) => (
        <span className={TOURNAMENT_STATUS_COLORS[t.status] ?? "status-closed"}>
          {TOURNAMENT_STATUS_LABELS[t.status] ?? t.status}
        </span>
      ),
      priority: "primary",
    },
    {
      key: "registered",
      header: "Registered",
      cell: (t) => {
        const n = t.registrations?.[0]?.count ?? 0;
        return `${n}${t.player_cap ? `/${t.player_cap}` : ""}`;
      },
      sortValue: (t) => t.registrations?.[0]?.count ?? 0,
      sortable: true,
      align: "right",
      priority: "secondary",
    },
    {
      key: "creator",
      header: "Creator",
      cell: (t) => t.creator?.display_name ?? "—",
      priority: "tertiary",
    },
    {
      key: "visibility",
      header: "Visibility",
      cell: (t) => <HideTournamentToggle tournamentId={t.id} isHidden={t.is_hidden ?? false} />,
      priority: "secondary",
    },
    {
      key: "actions",
      header: "",
      cell: (t) => (
        <div className="flex items-center justify-end gap-3 text-sm">
          <Link href={`/tournaments/${t.id}`} className="text-brand-400 hover:text-brand-300">
            View
          </Link>
          <AdminDeleteButton tournamentId={t.id} />
        </div>
      ),
      align: "right",
      priority: "primary",
    },
  ];

  return (
    <DataTable
      data={tournaments}
      columns={columns}
      keyFn={(t) => t.id}
      mobileMode="cards"
      caption="All tournaments"
      empty={{
        title: "No tournaments yet",
        description: "Create the first tournament to get things rolling.",
        illustration: <EmptyIllustrationTrophy />,
        actionLabel: "Create tournament",
        actionHref: "/tournaments/new",
      }}
    />
  );
}
