import { EmptyState } from "@/components/empty-state";
import { FormError } from "@/components/form-error";
import { createClient } from "@/lib/supabase/server";
import {
  sheetIsExpired,
  sheetSignupClosed,
  sheetWithdrawClosed,
} from "@/lib/sheet-lifecycle";
import { formatDate } from "@/lib/utils";
import type { SignupSheet } from "@/types/database";
import Link from "next/link";
import { SheetCard } from "./sheet-card";
import { WeatherBadge } from "@/components/weather-badge";

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
        .select("id, role")
        .eq("user_id", user.id)
        .single()
    : { data: null };

  // Check if user is admin of any group
  let isAnyGroupAdmin = false;
  if (profile) {
    if (profile.role === "admin") {
      isAnyGroupAdmin = true;
    } else {
      const { data: adminMemberships } = await supabase
        .from("group_memberships")
        .select("group_id, group:shootout_groups!inner(group_type)")
        .eq("player_id", profile.id)
        .eq("group_role", "admin");
      isAnyGroupAdmin = (adminMemberships ?? []).some(
        (m: any) => m.group?.group_type === "ladder_league"
      );
    }
  }

  // Hide sheets more than 3 hours after their event start time.
  // event_date is a date string (YYYY-MM-DD) and event_time is a time string (HH:MM).
  // We still fetch yesterday's rows so a late-night event that ended
  // after midnight UTC can be filtered precisely in JS via event_time.
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 1);

  // Members-only visibility — only show sheets from groups the
  // current player belongs to (site admins see everything).
  // Defence-in-depth: RLS (migration 088) enforces the same rule at
  // the DB level, so this filter primarily exists to make the
  // intention explicit and to avoid a wasted round-trip for users
  // with no memberships.
  let groupIdFilter: string[] | null = null;
  if (profile && profile.role !== "admin") {
    const { data: memberGroups } = await supabase
      .from("group_memberships")
      .select("group_id")
      .eq("player_id", profile.id);
    groupIdFilter = (memberGroups ?? []).map((m) => m.group_id);
  }

  let sheetsQuery = supabase
    .from("signup_sheets")
    .select("*, group:shootout_groups(id, name, slug)")
    .gte("event_date", cutoffDate.toISOString().split("T")[0])
    .order("event_date", { ascending: false });

  if (groupIdFilter !== null) {
    // Placeholder id forces an empty result when the user has no
    // memberships — PostgREST rejects `.in("col", [])`.
    const ids = groupIdFilter.length === 0 ? ["__none__"] : groupIdFilter;
    sheetsQuery = sheetsQuery.in("group_id", ids);
  }

  const { data: sheets, error } = await sheetsQuery;

  if (error) {
    return (
      <FormError message="Failed to load sign-up sheets. Please try again later." />
    );
  }

  // Drop any sheet whose event started more than 3 hours ago
  const filteredSheets = (sheets ?? []).filter((s) => !sheetIsExpired(s));

  // Sort: active sheets first (most recent on top), then cancelled (most recent on top)
  const sortedSheets = [...filteredSheets].sort((a, b) => {
    const aCancelled = a.status === "cancelled" ? 1 : 0;
    const bCancelled = b.status === "cancelled" ? 1 : 0;
    if (aCancelled !== bCancelled) return aCancelled - bCancelled;
    return new Date(b.event_date).getTime() - new Date(a.event_date).getTime();
  });

  // Fetch registrations per sheet
  const sheetIds = filteredSheets.map((s: SignupSheet) => s.id);
  const safeSheetIds = sheetIds.length > 0 ? sheetIds : ["__none__"];

  // Try with player join first, fall back to plain + separate profiles query
  let registrations: { sheet_id: string; status: string; player_id: string; playerName: string; avatarUrl: string | null }[] = [];
  {
    const { data, error: regError } = await supabase
      .from("registrations")
      .select("sheet_id, status, player_id, player:profiles!registrations_player_id_fkey(display_name, avatar_url)")
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
          .select("id, display_name, avatar_url")
          .in("id", playerIds);
        const playerMap = new Map((players ?? []).map((p) => [p.id, p]));
        registrations = plainRegs.map((r) => {
          const player = playerMap.get(r.player_id);
          return {
            sheet_id: r.sheet_id,
            status: r.status,
            player_id: r.player_id,
            playerName: player?.display_name ?? "Unknown",
            avatarUrl: player?.avatar_url ?? null,
          };
        });
      }
    } else {
      registrations = data.map((r: any) => ({
        sheet_id: r.sheet_id,
        status: r.status,
        player_id: r.player_id,
        playerName: r.player?.display_name ?? "Unknown",
        avatarUrl: r.player?.avatar_url ?? null,
      }));
    }
  }

  // Build per-sheet data: confirmed count, waitlist count, player list
  const confirmedCountMap: Record<string, number> = {};
  const waitlistCountMap: Record<string, number> = {};
  const playersMap: Record<string, { name: string; status: string; avatarUrl: string | null }[]> = {};

  registrations.forEach((r) => {
    if (r.status === "confirmed") {
      confirmedCountMap[r.sheet_id] = (confirmedCountMap[r.sheet_id] ?? 0) + 1;
    } else {
      waitlistCountMap[r.sheet_id] = (waitlistCountMap[r.sheet_id] ?? 0) + 1;
    }
    if (!playersMap[r.sheet_id]) playersMap[r.sheet_id] = [];
    playersMap[r.sheet_id].push({
      name: r.playerName,
      status: r.status,
      avatarUrl: r.avatarUrl,
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
    const signupClosed = sheetSignupClosed(sheet);
    const withdrawClosed = sheetWithdrawClosed(sheet);

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
        isLoggedIn={!!profile}
        weather={
          <WeatherBadge
            location={sheet.location}
            eventTime={sheet.event_time}
          />
        }
      />
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-dark-100">Sign-Up Sheets</h1>
        {isAnyGroupAdmin && (
          <Link href="/sheets/new" className="btn-primary text-sm">
            Create Sign-Up Sheet
          </Link>
        )}
      </div>

      {!sortedSheets || sortedSheets.length === 0 ? (
        <EmptyState
          icon={
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-12 w-12">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15a2.25 2.25 0 0 1 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25Z" />
            </svg>
          }
          title="No sign-up sheets yet"
          description="Check back soon for upcoming events."
        />
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
