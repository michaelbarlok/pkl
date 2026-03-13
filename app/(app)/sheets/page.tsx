import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { formatDate, formatShortDate } from "@/lib/utils";
import type { SignupSheet } from "@/types/database";
import { QuickSignUp } from "./quick-signup";

export const dynamic = "force-dynamic";

const statusBadge: Record<string, { className: string; label: string }> = {
  open: { className: "badge-green", label: "Open" },
  closed: { className: "badge-yellow", label: "Closed" },
  cancelled: { className: "badge-red", label: "Cancelled" },
};

export default async function SheetsPage() {
  const supabase = await createClient();

  // Get current user's profile
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user.id)
        .single()
    : { data: null };

  const { data: sheets, error } = await supabase
    .from("signup_sheets")
    .select("*, group:shootout_groups(id, name, slug)")
    .order("event_date", { ascending: false });

  if (error) {
    return (
      <div className="card text-center text-red-400">
        Failed to load sign-up sheets. Please try again later.
      </div>
    );
  }

  // Fetch registration counts per sheet
  const sheetIds = (sheets ?? []).map((s: SignupSheet) => s.id);
  const { data: regCounts } = await supabase
    .from("registrations")
    .select("sheet_id, status")
    .in("sheet_id", sheetIds.length > 0 ? sheetIds : ["__none__"])
    .in("status", ["confirmed", "waitlist"]);

  const countMap: Record<string, number> = {};
  (regCounts ?? []).forEach((r: { sheet_id: string; status: string }) => {
    if (r.status === "confirmed") {
      countMap[r.sheet_id] = (countMap[r.sheet_id] ?? 0) + 1;
    }
  });

  // Fetch current user's registrations
  const myRegMap: Record<string, string> = {};
  if (profile) {
    const { data: myRegs } = await supabase
      .from("registrations")
      .select("sheet_id, status")
      .eq("player_id", profile.id)
      .in("sheet_id", sheetIds.length > 0 ? sheetIds : ["__none__"])
      .in("status", ["confirmed", "waitlist"]);
    (myRegs ?? []).forEach((r: { sheet_id: string; status: string }) => {
      myRegMap[r.sheet_id] = r.status;
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-dark-100">Sign-Up Sheets</h1>
      </div>

      {!sheets || sheets.length === 0 ? (
        <div className="card text-center text-surface-muted">
          No sign-up sheets available yet.
        </div>
      ) : (
        <div className="space-y-3">
          {sheets.map((sheet: SignupSheet & { group?: { id: string; name: string; slug: string } }) => {
            const badge = statusBadge[sheet.status] ?? statusBadge.closed;
            const registered = countMap[sheet.id] ?? 0;
            const myStatus = myRegMap[sheet.id];
            const isOpen = sheet.status === "open";
            const signupClosed = new Date(sheet.signup_closes_at) < new Date();

            return (
              <div
                key={sheet.id}
                className="card flex items-center justify-between hover:ring-brand-500/30 transition-shadow"
              >
                <Link
                  href={`/sheets/${sheet.id}`}
                  className="min-w-0 flex-1"
                >
                  <div className="flex items-center gap-3">
                    <p className="font-semibold text-dark-100">
                      {sheet.group?.name ?? "Event"}
                    </p>
                    <span className={badge.className}>{badge.label}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-surface-muted">
                    <span>{formatDate(sheet.event_date)}</span>
                    <span>{sheet.location}</span>
                  </div>
                </Link>
                <div className="ml-4 flex items-center gap-3 shrink-0">
                  <div className="text-right text-sm text-surface-muted">
                    <span className="font-medium text-dark-100">
                      {registered}
                    </span>
                    /{sheet.player_limit} players
                  </div>
                  {myStatus ? (
                    <span className={myStatus === "confirmed" ? "badge-green" : "badge-yellow"}>
                      {myStatus === "confirmed" ? "Signed Up" : "Waitlisted"}
                    </span>
                  ) : isOpen && !signupClosed ? (
                    <QuickSignUp sheetId={sheet.id} />
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
