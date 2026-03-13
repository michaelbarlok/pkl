import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { formatDate, formatTime } from "@/lib/utils";
import type { Registration, Profile } from "@/types/database";
import { SheetActions } from "./sheet-actions";
import { AdminAddMember } from "./admin-add-member";
import { AdminDeleteSheet } from "./admin-delete-sheet";
import { AdminRemovePlayer } from "./admin-remove-player";
import { StartShootout } from "./start-shootout";

export const dynamic = "force-dynamic";

export default async function SheetDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  // Get current user
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", user.id)
    .single();
  if (!profile) notFound();

  // Fetch the sheet with group info
  const { data: sheet, error } = await supabase
    .from("signup_sheets")
    .select("*, group:shootout_groups(*)")
    .eq("id", id)
    .single();

  if (error || !sheet) notFound();

  // Fetch registrations — try with player join, fall back to plain query
  let registrations: (Registration & { player?: Profile })[] | null = null;
  {
    const { data, error: regError } = await supabase
      .from("registrations")
      .select("*, player:profiles!registrations_player_id_fkey(*)")
      .eq("sheet_id", id)
      .in("status", ["confirmed", "waitlist"])
      .order("signed_up_at", { ascending: true });

    if (regError) {
      // Fallback: query without join, then fetch profiles separately
      console.error("Registration join query failed:", regError.message);
      const { data: plainRegs } = await supabase
        .from("registrations")
        .select("*")
        .eq("sheet_id", id)
        .in("status", ["confirmed", "waitlist"])
        .order("signed_up_at", { ascending: true });

      if (plainRegs && plainRegs.length > 0) {
        const playerIds = plainRegs.map((r) => r.player_id);
        const { data: players } = await supabase
          .from("profiles")
          .select("*")
          .in("id", playerIds);
        const playerMap = new Map((players ?? []).map((p) => [p.id, p]));
        registrations = plainRegs.map((r) => ({
          ...r,
          player: playerMap.get(r.player_id) ?? undefined,
        }));
      } else {
        registrations = [];
      }
    } else {
      registrations = data;
    }
  }

  const confirmed = (registrations ?? []).filter(
    (r: Registration) => r.status === "confirmed"
  );
  const waitlisted = (registrations ?? []).filter(
    (r: Registration) => r.status === "waitlist"
  );

  // Check current user's registration
  const myRegistration = (registrations ?? []).find(
    (r: Registration) => r.player_id === profile.id
  );

  const now = new Date();
  const signupClosed = new Date(sheet.signup_closes_at) < now;
  const withdrawClosed = sheet.withdraw_closes_at
    ? new Date(sheet.withdraw_closes_at) < now
    : false;
  const isCancelled = sheet.status === "cancelled";
  const isFull = confirmed.length >= sheet.player_limit;
  const isAdmin = profile.role === "admin";

  // Add-member: admins always, regular members when allow_member_guests is on
  const canAddMembers = isAdmin || (sheet.allow_member_guests && !signupClosed);
  const registeredPlayerIds = new Set(
    (registrations ?? []).map((r: Registration) => r.player_id)
  );
  let availableMembers: { id: string; display_name: string }[] = [];
  if (canAddMembers && !isCancelled) {
    const { data: allProfiles } = await supabase
      .from("profiles")
      .select("id, display_name")
      .eq("is_active", true)
      .order("display_name", { ascending: true });

    availableMembers = (allProfiles ?? []).filter(
      (p) => !registeredPlayerIds.has(p.id)
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <Link
            href="/sheets"
            className="text-sm text-brand-600 hover:text-brand-500"
          >
            &larr; All Sheets
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-dark-100">
            {sheet.group?.name ?? "Event"}
          </h1>
          <p className="mt-1 text-surface-muted">{sheet.location}</p>
        </div>
        <div>
          {sheet.status === "open" && <span className="badge-green">Open</span>}
          {sheet.status === "closed" && (
            <span className="badge-yellow">Closed</span>
          )}
          {sheet.status === "cancelled" && (
            <span className="badge-red">Cancelled</span>
          )}
        </div>
      </div>

      {isCancelled && (
        <div className="rounded-md bg-red-900/30 p-4 text-red-300">
          This event has been cancelled.
        </div>
      )}

      {/* Event Info */}
      <div className="card">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <p className="text-sm font-medium text-surface-muted">Date</p>
            <p className="mt-1 text-dark-100">{formatDate(sheet.event_date)}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-surface-muted">Time</p>
            <p className="mt-1 text-dark-100">{formatTime(sheet.event_time)}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-surface-muted">Location</p>
            <p className="mt-1 text-dark-100">{sheet.location}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-surface-muted">Group</p>
            <p className="mt-1 text-dark-100">{sheet.group?.name ?? "N/A"}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-surface-muted">Player Limit</p>
            <p className="mt-1 text-dark-100">
              {confirmed.length}/{sheet.player_limit}
              {waitlisted.length > 0 && (
                <span className="ml-2 text-sm text-surface-muted">
                  (+{waitlisted.length} waitlisted)
                </span>
              )}
            </p>
          </div>
          <div>
            <p className="text-sm font-medium text-surface-muted">
              Sign-Up Closes
            </p>
            <p className="mt-1 text-dark-100">
              {formatDate(sheet.signup_closes_at)},{" "}
              {formatTime(sheet.signup_closes_at)}
            </p>
          </div>
          {sheet.withdraw_closes_at && (
            <div>
              <p className="text-sm font-medium text-surface-muted">
                Withdraw Deadline
              </p>
              <p className="mt-1 text-dark-100">
                {formatDate(sheet.withdraw_closes_at)},{" "}
                {formatTime(sheet.withdraw_closes_at)}
              </p>
            </div>
          )}
        </div>

        {sheet.notes && (
          <div className="mt-4 border-t border-surface-border pt-4">
            <p className="text-sm font-medium text-surface-muted">Notes</p>
            <p className="mt-1 text-dark-200">{sheet.notes}</p>
          </div>
        )}
      </div>

      {/* Sign-Up / Withdraw Actions */}
      {!isCancelled && (
        <SheetActions
          sheetId={sheet.id}
          profileId={profile.id}
          myRegistration={
            myRegistration
              ? { id: myRegistration.id, status: myRegistration.status }
              : null
          }
          signupClosed={signupClosed}
          withdrawClosed={withdrawClosed}
          isFull={isFull}
        />
      )}

      {/* Admin actions: Start Shootout, Add Member, Cancel Event */}
      {isAdmin && !isCancelled && (
        <div className="card space-y-4">
          <h3 className="text-sm font-semibold text-dark-100">Admin Actions</h3>
          <div className="flex flex-wrap gap-3">
            {sheet.status === "open" && (
              <StartShootout
                sheetId={sheet.id}
                groupId={sheet.group_id}
                confirmedPlayerIds={confirmed.map((r: Registration) => r.player_id)}
              />
            )}
            <AdminDeleteSheet sheetId={sheet.id} />
          </div>
        </div>
      )}

      {/* Add a member (admins always, regular members when enabled) */}
      {canAddMembers && !isCancelled && (
        <AdminAddMember sheetId={sheet.id} members={availableMembers} />
      )}

      {/* Players */}
      <section>
        <h2 className="text-lg font-semibold text-dark-100 mb-3">
          Players ({confirmed.length}/{sheet.player_limit})
          {waitlisted.length > 0 && (
            <span className="ml-2 text-sm font-normal text-surface-muted">
              +{waitlisted.length} waitlisted
            </span>
          )}
        </h2>
        {confirmed.length > 0 || waitlisted.length > 0 ? (
          <div className="card divide-y divide-surface-border max-h-[32rem] overflow-y-auto">
            {confirmed.map((reg: Registration & { player?: Profile }) => (
              <div
                key={reg.id}
                className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
              >
                {reg.player?.avatar_url ? (
                  <img
                    src={reg.player.avatar_url}
                    alt=""
                    className="h-8 w-8 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-overlay text-sm font-medium text-surface-muted">
                    {reg.player?.display_name?.charAt(0) ?? "?"}
                  </div>
                )}
                <span className="flex-1 text-dark-100">
                  {reg.player?.display_name ?? "Unknown"}
                </span>
                {reg.player?.skill_level && (
                  <span className="badge-blue text-xs">
                    {reg.player.skill_level}
                  </span>
                )}
                {isAdmin && !isCancelled && (
                  <AdminRemovePlayer
                    registrationId={reg.id}
                    playerName={reg.player?.display_name ?? "this player"}
                  />
                )}
              </div>
            ))}
            {waitlisted.length > 0 && (
              <>
                <div className="py-2">
                  <span className="text-xs font-medium uppercase text-surface-muted">
                    Waitlist
                  </span>
                </div>
                {waitlisted.map(
                  (reg: Registration & { player?: Profile }, idx: number) => (
                    <div
                      key={reg.id}
                      className="flex items-center gap-3 py-3"
                    >
                      <span className="text-sm font-medium text-surface-muted w-6 text-right">
                        {idx + 1}.
                      </span>
                      {reg.player?.avatar_url ? (
                        <img
                          src={reg.player.avatar_url}
                          alt=""
                          className="h-8 w-8 rounded-full object-cover"
                        />
                      ) : (
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-overlay text-sm font-medium text-surface-muted">
                          {reg.player?.display_name?.charAt(0) ?? "?"}
                        </div>
                      )}
                      <span className="flex-1 text-dark-100">
                        {reg.player?.display_name ?? "Unknown"}
                      </span>
                      <span className="badge-yellow text-xs">Waitlisted</span>
                      {isAdmin && !isCancelled && (
                        <AdminRemovePlayer
                          registrationId={reg.id}
                          playerName={reg.player?.display_name ?? "this player"}
                        />
                      )}
                    </div>
                  )
                )}
              </>
            )}
          </div>
        ) : (
          <div className="card text-center text-surface-muted">
            No players signed up yet.
          </div>
        )}
      </section>
    </div>
  );
}
