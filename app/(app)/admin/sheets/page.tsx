import { EmptyState } from "@/components/empty-state";
import { Breadcrumb } from "@/components/breadcrumb";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { formatDate } from "@/lib/utils";
import type { SignupSheet } from "@/types/database";
import { DeleteSheetButton } from "./delete-sheet-button";

const statusBadge: Record<string, { className: string; label: string }> = {
  open: { className: "badge-green", label: "Open" },
  closed: { className: "badge-yellow", label: "Closed" },
  cancelled: { className: "badge-red", label: "Cancelled" },
};

export default async function AdminSheetsPage() {
  const supabase = await createClient();

  // Fetch all sheets, pre-sorted by event_date desc at the DB level.
  // The secondary cancelled-last partition is done in JS via a stable sort
  // (JS sort is stable since ES2019, so relative date order is preserved).
  const { data: sheets, error } = await supabase
    .from("signup_sheets")
    .select("*, group:shootout_groups(id, name)")
    .order("event_date", { ascending: false });

  if (error) {
    return (
      <div className="card text-center text-red-400">
        Failed to load sheets.
      </div>
    );
  }

  // Stable partition: non-cancelled first, then cancelled.
  // Each group retains the event_date-desc order from the DB query.
  const sortedSheets = [...(sheets ?? [])].sort((a, b) => {
    const aCancelled = a.status === "cancelled" ? 1 : 0;
    const bCancelled = b.status === "cancelled" ? 1 : 0;
    return aCancelled - bCancelled;
  });

  // Fetch registration counts
  const sheetIds = (sheets ?? []).map((s: SignupSheet) => s.id);
  const { data: regRows } = await supabase
    .from("registrations")
    .select("sheet_id, status")
    .in("sheet_id", sheetIds.length > 0 ? sheetIds : ["__none__"])
    .in("status", ["confirmed", "waitlist"]);

  const countMap: Record<string, { confirmed: number; waitlisted: number }> =
    {};
  (regRows ?? []).forEach((r: { sheet_id: string; status: string }) => {
    if (!countMap[r.sheet_id])
      countMap[r.sheet_id] = { confirmed: 0, waitlisted: 0 };
    if (r.status === "confirmed") countMap[r.sheet_id].confirmed++;
    if (r.status === "waitlist") countMap[r.sheet_id].waitlisted++;
  });

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: "Admin" }, { label: "Sign-Up Sheets" }]} />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-dark-100">Manage Sign-Up Sheets</h1>
          <p className="mt-1 text-sm text-surface-muted">Create and manage event sign-up sheets for your groups.</p>
        </div>
        <Link href="/admin/sheets/new" className="btn-primary">
          Create Sheet
        </Link>
      </div>

      {!sortedSheets || sortedSheets.length === 0 ? (
        <EmptyState
          title="No sign-up sheets created yet"
          description="Create a sheet to start managing event sign-ups."
          actionLabel="Create Sheet"
          actionHref="/admin/sheets/new"
        />
      ) : (
        <>
          {(() => {
            const activeSheets = sortedSheets.filter((s) => s.status !== "cancelled");
            const cancelledSheets = sortedSheets.filter((s) => s.status === "cancelled");

            const renderTable = (
              rows: (SignupSheet & { group?: { id: string; name: string } })[]
            ) => (
              <div className="card overflow-x-auto p-0">
                <table className="min-w-full text-left">
                  <thead>
                    <tr className="bg-surface-overlay text-xs font-medium uppercase text-surface-muted">
                      <th className="py-3 pl-2 sm:pl-4 pr-2">Date</th>
                      <th className="py-3 px-2">Status</th>
                      <th className="hidden sm:table-cell py-3 px-2">Group</th>
                      <th className="py-3 px-2">Reg/Limit</th>
                      <th className="hidden sm:table-cell py-3 px-2">Waitlisted</th>
                      <th className="py-3 pl-2 pr-2 sm:pr-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((sheet) => {
                      const badge =
                        statusBadge[sheet.status] ?? statusBadge.closed;
                      const counts = countMap[sheet.id] ?? {
                        confirmed: 0,
                        waitlisted: 0,
                      };

                      return (
                        <tr
                          key={sheet.id}
                          className={`border-t border-surface-border ${
                            sheet.status === "cancelled" ? "bg-red-900/30" : ""
                          }`}
                        >
                          <td className="py-3 pl-2 sm:pl-4 pr-2 text-sm font-medium text-dark-100">
                            {formatDate(sheet.event_date)}
                          </td>
                          <td className="py-3 px-2">
                            <span className={badge.className}>{badge.label}</span>
                          </td>
                          <td className="hidden sm:table-cell py-3 px-2 text-sm text-dark-200">
                            {sheet.group?.name ?? "---"}
                          </td>
                          <td className="py-3 px-2 text-sm text-dark-200">
                            {counts.confirmed}/{sheet.player_limit}
                          </td>
                          <td className="hidden sm:table-cell py-3 px-2 text-sm text-dark-200">
                            {counts.waitlisted}
                          </td>
                          <td className="py-3 pl-2 pr-2 sm:pr-4 text-right">
                            <div className="flex items-center justify-end gap-2 flex-wrap">
                              <Link
                                href={`/sheets/${sheet.id}`}
                                className="text-sm text-brand-400 hover:text-brand-300"
                              >
                                View
                              </Link>
                              <Link
                                href={`/admin/sheets/${sheet.id}`}
                                className="text-sm text-brand-400 hover:text-brand-300"
                              >
                                Edit
                              </Link>
                              {sheet.status !== "cancelled" && (
                                <Link
                                  href={`/admin/sheets/${sheet.id}?action=cancel`}
                                  className="text-sm text-red-400 hover:text-red-500"
                                >
                                  Cancel
                                </Link>
                              )}
                              <DeleteSheetButton sheetId={sheet.id} />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );

            return (
              <div className="space-y-6">
                {activeSheets.length > 0 && (
                  <div className="space-y-2">
                    <h2 className="text-lg font-semibold text-dark-100">Active</h2>
                    {renderTable(activeSheets)}
                  </div>
                )}
                {cancelledSheets.length > 0 && (
                  <div className="space-y-2">
                    <h2 className="text-lg font-semibold text-surface-muted">Cancelled</h2>
                    {renderTable(cancelledSheets)}
                  </div>
                )}
              </div>
            );
          })()}
        </>
      )}
    </div>
  );
}
