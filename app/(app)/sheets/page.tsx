import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import type { SignupSheet } from "@/types/database";
import { SheetCard } from "./sheet-card";

export const dynamic = "force-dynamic";

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

  // Sort: active sheets first (most recent on top), then cancelled (most recent on top)
  const sortedSheets = [...(sheets ?? [])].sort((a, b) => {
    const aCancelled = a.status === "cancelled" ? 1 : 0;
    const bCancelled = b.status === "cancelled" ? 1 : 0;
    if (aCancelled !== bCancelled) return aCancelled - bCancelled;
    return new Date(b.event_date).getTime() - new Date(a.event_date).getTime();
  });

  // Fetch registrations per sheet
  const sheetIds = (sheets ?? []).map((s: SignupSheet) => s.id);
  const safeSheetIds = sheetIds.length > 0 ? sheetIds : ["__none__"];

  // Try with player join first, fall back to plain + separate profiles query
  let registrations: { sheet_id: string; status: string; player_id: string; player?: { display_name: string } | null }[] = [];
  {
    const { data, error: regError } = await supabase
      .from("registrations")
      .select("sheet_id, status, player_id, player:profiles!registrations_player_id_fkey(display_name)")
      .in("sheet_id", safeSheetIds)
      .in("status", ["confirmed", "waitlist"])
      .order("signed_up_at", { ascending: true });

    if (regError || !data) {
      // Fallback: plain query + separate profiles fetch
      const { data: plainRegs } = await supabase
        .from("registrations")
        .select("sheet_id, status, player_id")
        .in("sheet_id", safeSheetIds)
        .in("status", ["confirmed", "waitlist"])
        .order("signed_up_at", { ascending: true });

      if (plainRegs && plainRegs.length > 0) {
        const playerIds = [...new Set(plainRegs.map((r) => r.player_id))];
        const { data: players } = await supabase
          .from("profiles")
          .select("id, display_name")
          .in("id", playerIds);
        const playerMap = new Map((players ?? []).map((p) => [p.id, p.display_name]));
        registrations = plainRegs.map((r) => ({
          ...r,
          player: { display_name: playerMap.get(r.player_id) ?? "Unknown" },
        }));
      }
    } else {
      registrations = data;
    }
  }

  // Build per-sheet data: confirmed count, waitlist count, player list
  const confirmedCountMap: Record<string, number> = {};
  const waitlistCountMap: Record<string, number> = {};
  const playersMap: Record<string, { name: string; status: string }[]> = {};

  registrations.forEach((r) => {
    if (r.status === "confirmed") {
      confirmedCountMap[r.sheet_id] = (confirmedCountMap[r.sheet_id] ?? 0) + 1;
    } else {
      waitlistCountMap[r.sheet_id] = (waitlistCountMap[r.sheet_id] ?? 0) + 1;
    }
    if (!playersMap[r.sheet_id]) playersMap[r.sheet_id] = [];
    playersMap[r.sheet_id].push({
      name: r.player?.display_name ?? "Unknown",
      status: r.status,
    });
  });

  // Sort players: confirmed first, then waitlisted
  for (const sheetId of Object.keys(playersMap)) {
    playersMap[sheetId].sort((a, b) => {
      if (a.status !== b.status) return a.status === "confirmed" ? -1 : 1;
      return 0; // already ordered by signed_up_at from query
    });
  }

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

  const activeSheets = sortedSheets.filter((s) => s.status !== "cancelled");
  const cancelledSheets = sortedSheets.filter((s) => s.status === "cancelled");

  const renderCard = (sheet: SignupSheet & { group?: { id: string; name: string; slug: string } }) => {
    const confirmed = confirmedCountMap[sheet.id] ?? 0;
    const waitlisted = waitlistCountMap[sheet.id] ?? 0;
    const players = playersMap[sheet.id] ?? [];
    const myStatus = myRegMap[sheet.id] ?? null;
    const signupClosed = new Date(sheet.signup_closes_at) < new Date();
    const withdrawClosed = sheet.withdraw_closes_at
      ? new Date(sheet.withdraw_closes_at) < new Date()
      : false;

    return (
      <SheetCard
        key={sheet.id}
        sheetId={sheet.id}
        groupName={sheet.group?.name ?? "Event"}
        status={sheet.status}
        eventDate={formatDate(sheet.event_date)}
        location={sheet.location}
        playerLimit={sheet.player_limit}
        confirmedCount={confirmed}
        waitlistCount={waitlisted}
        players={players}
        myStatus={myStatus}
        signupClosed={signupClosed}
        withdrawClosed={withdrawClosed}
        isFull={confirmed >= sheet.player_limit}
      />
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-dark-100">Sign-Up Sheets</h1>
      </div>

      {!sortedSheets || sortedSheets.length === 0 ? (
        <div className="card text-center text-surface-muted">
          No sign-up sheets available yet.
        </div>
      ) : (
        <div className="space-y-6">
          {activeSheets.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold text-dark-100">Active</h2>
              {activeSheets.map(renderCard)}
            </div>
          )}
          {cancelledSheets.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold text-surface-muted">Cancelled</h2>
              {cancelledSheets.map(renderCard)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
