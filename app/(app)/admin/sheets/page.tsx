import { Breadcrumb } from "@/components/breadcrumb";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import type { SignupSheet } from "@/types/database";
import { SheetsTable, type SheetRow } from "./sheets-table";

export default async function AdminSheetsPage() {
  const supabase = await createClient();

  const { data: sheets, error } = await supabase
    .from("signup_sheets")
    .select("*, group:shootout_groups(id, name)")
    .order("event_date", { ascending: false });

  if (error) {
    return <div className="card text-center text-adaptive-red">Failed to load sheets.</div>;
  }

  // Registration counts per sheet
  const sheetIds = (sheets ?? []).map((s: SignupSheet) => s.id);
  const { data: regRows } = await supabase
    .from("registrations")
    .select("sheet_id, status")
    .in("sheet_id", sheetIds.length > 0 ? sheetIds : ["__none__"])
    .in("status", ["confirmed", "waitlist"]);

  const countMap: Record<string, { confirmed: number; waitlisted: number }> = {};
  (regRows ?? []).forEach((r: { sheet_id: string; status: string }) => {
    if (!countMap[r.sheet_id]) countMap[r.sheet_id] = { confirmed: 0, waitlisted: 0 };
    if (r.status === "confirmed") countMap[r.sheet_id].confirmed++;
    if (r.status === "waitlist") countMap[r.sheet_id].waitlisted++;
  });

  // Shape and partition
  const all: SheetRow[] = (sheets ?? []).map((s: SignupSheet & { group?: { id: string; name: string } }) => ({
    id: s.id,
    event_date: s.event_date,
    event_time: s.event_time ?? null,
    player_limit: s.player_limit,
    status: s.status,
    group: s.group ?? null,
    confirmed: countMap[s.id]?.confirmed ?? 0,
    waitlisted: countMap[s.id]?.waitlisted ?? 0,
  }));

  const active = all.filter((s) => s.status !== "cancelled");
  const cancelled = all.filter((s) => s.status === "cancelled");

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: "Admin" }, { label: "Sign-Up Sheets" }]} />
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-heading">Manage Sign-Up Sheets</h1>
          <p className="mt-1 text-sm text-surface-muted">
            Create and manage event sign-up sheets for your groups.
          </p>
        </div>
        <Link href="/admin/sheets/new" className="btn-primary whitespace-nowrap">
          Create Sheet
        </Link>
      </div>

      <div className="space-y-2">
        <h2 className="text-eyebrow">Active</h2>
        <SheetsTable sheets={active} kind="active" />
      </div>

      {cancelled.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-eyebrow">Cancelled</h2>
          <SheetsTable sheets={cancelled} kind="cancelled" />
        </div>
      )}
    </div>
  );
}
