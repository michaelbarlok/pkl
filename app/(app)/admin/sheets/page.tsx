import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { formatShortDate } from "@/lib/utils";
import type { SignupSheet } from "@/types/database";

const statusBadge: Record<string, { className: string; label: string }> = {
  open: { className: "badge-green", label: "Open" },
  closed: { className: "badge-yellow", label: "Closed" },
  cancelled: { className: "badge-red", label: "Cancelled" },
};

export default async function AdminSheetsPage() {
  const supabase = await createClient();

  // Verify admin
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", user.id)
    .single();

  if (!profile || profile.role !== "admin") redirect("/");

  // Fetch all sheets
  const { data: sheets, error } = await supabase
    .from("signup_sheets")
    .select("*, group:shootout_groups(id, name)")
    .order("event_date", { ascending: false });

  if (error) {
    return (
      <div className="card text-center text-red-600">
        Failed to load sheets.
      </div>
    );
  }

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
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">
          Manage Sign-Up Sheets
        </h1>
        <Link href="/admin/sheets/new" className="btn-primary">
          Create Sheet
        </Link>
      </div>

      {!sheets || sheets.length === 0 ? (
        <div className="card text-center text-gray-500">
          No sign-up sheets created yet.
        </div>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="min-w-full text-left">
            <thead>
              <tr className="bg-gray-50 text-xs font-medium uppercase text-gray-500">
                <th className="py-3 pl-4 pr-2">Date</th>
                <th className="py-3 px-2">Status</th>
                <th className="py-3 px-2">Group</th>
                <th className="py-3 px-2">Registered/Limit</th>
                <th className="py-3 px-2">Waitlisted</th>
                <th className="py-3 pl-2 pr-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sheets.map(
                (
                  sheet: SignupSheet & {
                    group?: { id: string; name: string };
                  }
                ) => {
                  const badge =
                    statusBadge[sheet.status] ?? statusBadge.closed;
                  const counts = countMap[sheet.id] ?? {
                    confirmed: 0,
                    waitlisted: 0,
                  };

                  return (
                    <tr
                      key={sheet.id}
                      className={`border-t border-gray-100 ${
                        sheet.status === "cancelled" ? "bg-red-50" : ""
                      }`}
                    >
                      <td className="py-3 pl-4 pr-2 text-sm font-medium text-gray-900">
                        {formatShortDate(sheet.event_date)}
                        {sheet.status === "cancelled" && (
                          <span className="ml-2 text-xs font-bold text-red-600 uppercase">
                            Cancelled
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-2">
                        <span className={badge.className}>{badge.label}</span>
                      </td>
                      <td className="py-3 px-2 text-sm text-gray-700">
                        {sheet.group?.name ?? "---"}
                      </td>
                      <td className="py-3 px-2 text-sm text-gray-700">
                        {counts.confirmed}/{sheet.player_limit}
                      </td>
                      <td className="py-3 px-2 text-sm text-gray-700">
                        {counts.waitlisted}
                      </td>
                      <td className="py-3 pl-2 pr-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            href={`/sheets/${sheet.id}`}
                            className="text-sm text-brand-600 hover:text-brand-500"
                          >
                            View
                          </Link>
                          <Link
                            href={`/admin/sheets/${sheet.id}`}
                            className="text-sm text-brand-600 hover:text-brand-500"
                          >
                            Edit
                          </Link>
                          {sheet.status !== "cancelled" && (
                            <Link
                              href={`/admin/sheets/${sheet.id}?action=cancel`}
                              className="text-sm text-red-600 hover:text-red-500"
                            >
                              Cancel
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                }
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
