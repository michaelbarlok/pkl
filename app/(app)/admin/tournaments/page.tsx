import { createClient } from "@/lib/supabase/server";
import { Breadcrumb } from "@/components/breadcrumb";
import Link from "next/link";
import { TournamentsTable, type TournamentRow } from "./tournaments-table";

export default async function AdminTournamentsPage() {
  const supabase = await createClient();

  const { data } = await supabase
    .from("tournaments")
    .select(
      "*, creator:profiles!created_by(display_name), registrations:tournament_registrations(count)"
    )
    .order("created_at", { ascending: false });

  const tournaments: TournamentRow[] = (data ?? []) as unknown as TournamentRow[];

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: "Admin" }, { label: "Tournaments" }]} />
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-heading">Manage Tournaments</h1>
          <p className="mt-1 text-sm text-surface-muted">
            View, hide, and delete all tournaments across the platform.
          </p>
        </div>
        <Link href="/tournaments/new" className="btn-primary whitespace-nowrap">
          Create
        </Link>
      </div>

      <TournamentsTable tournaments={tournaments} />
    </div>
  );
}
