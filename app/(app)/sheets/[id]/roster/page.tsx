import { EmptyState } from "@/components/empty-state";
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { formatDate } from "@/lib/utils";
import type { Registration, Profile, GroupMembership } from "@/types/database";
import { RosterRemoveButton } from "./roster-remove-button";

export default async function RosterPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  // Get current user and check admin
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

  const isAdmin = profile.role === "admin";

  // Fetch sheet with group
  const { data: sheet, error } = await supabase
    .from("signup_sheets")
    .select("*, group:shootout_groups(*)")
    .eq("id", id)
    .single();

  if (error || !sheet) notFound();

  // Fetch registrations with player profiles
  const { data: registrations } = await supabase
    .from("registrations")
    .select("*, player:profiles!registrations_player_id_fkey(*)")
    .eq("sheet_id", id)
    .in("status", ["confirmed", "waitlist"])
    .order("signed_up_at", { ascending: true });

  const confirmed = (registrations ?? []).filter(
    (r: Registration) => r.status === "confirmed"
  );
  const waitlisted = (registrations ?? []).filter(
    (r: Registration) => r.status === "waitlist"
  );

  // Fetch group memberships for ladder steps
  const playerIds = (registrations ?? []).map(
    (r: Registration) => r.player_id
  );
  const { data: memberships } = await supabase
    .from("group_memberships")
    .select("*")
    .eq("group_id", sheet.group_id)
    .in("player_id", playerIds.length > 0 ? playerIds : ["__none__"]);

  const membershipMap: Record<string, GroupMembership> = {};
  (memberships ?? []).forEach((m: GroupMembership) => {
    membershipMap[m.player_id] = m;
  });

  function renderPlayerRow(
    reg: Registration & { player?: Profile },
    index: number,
    showWaitlistNumber: boolean
  ) {
    const membership = membershipMap[reg.player_id];
    const isGuest = reg.registered_by && reg.registered_by !== reg.player_id;

    return (
      <tr key={reg.id} className="border-t border-surface-border">
        <td className="py-3 pl-4 pr-2 text-sm text-surface-muted w-10">
          {showWaitlistNumber ? `W${index + 1}` : index + 1}
        </td>
        <td className="py-3 px-2">
          <div className="flex items-center gap-3">
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
            <div>
              <span className="font-medium text-dark-100">
                {reg.player?.display_name ?? "Unknown"}
              </span>
              {isGuest && sheet.allow_member_guests && (
                <span className="ml-2 badge-gray text-xs">Guest</span>
              )}
            </div>
          </div>
        </td>
        <td className="py-3 px-2 text-sm text-surface-muted">
          {reg.player?.skill_level ?? "---"}
        </td>
        <td className="py-3 px-2 text-sm text-surface-muted">
          {membership ? `Step ${membership.current_step}` : "---"}
        </td>
        {isAdmin && (
          <>
            <td className="py-3 px-2 text-sm text-surface-muted">
              {reg.registered_by && reg.registered_by !== reg.player_id
                ? "Admin"
                : "Self"}
            </td>
            <td className="py-3 pl-2 pr-4 text-right">
              <RosterRemoveButton
                registrationId={reg.id}
                sheetId={id}
                playerName={reg.player?.display_name ?? "this player"}
              />
            </td>
          </>
        )}
      </tr>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <Link
          href={`/sheets/${id}`}
          className="text-sm text-brand-400 hover:text-brand-300"
        >
          &larr; Back to sheet
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-dark-100">
          Roster: {sheet.group?.name ?? "Event"}
        </h1>
        <p className="mt-1 text-surface-muted">
          {formatDate(sheet.event_date)} &middot; {sheet.location}
        </p>
      </div>

      {/* Main Roster */}
      <section>
        <h2 className="text-lg font-semibold text-dark-100 mb-3">
          Main Roster ({confirmed.length}/{sheet.player_limit})
        </h2>
        {confirmed.length > 0 ? (
          <div className="card overflow-hidden p-0">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-surface-overlay text-xs font-medium uppercase text-surface-muted">
                  <th className="py-2 pl-4 pr-2">#</th>
                  <th className="py-2 px-2">Player</th>
                  <th className="py-2 px-2">Skill</th>
                  <th className="py-2 px-2">Ladder</th>
                  {isAdmin && <th className="py-2 px-2">Registered By</th>}
                  {isAdmin && <th className="py-2 pl-2 pr-4 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {confirmed.map(
                  (reg: Registration & { player?: Profile }, idx: number) =>
                    renderPlayerRow(reg, idx, false)
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="No confirmed players yet"
            description="Players will appear here once they sign up."
          />
        )}
      </section>

      {/* Waitlist */}
      <section>
        <h2 className="text-lg font-semibold text-dark-100 mb-3">
          Waitlist ({waitlisted.length})
        </h2>
        {waitlisted.length > 0 ? (
          <div className="card overflow-hidden p-0">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-surface-overlay text-xs font-medium uppercase text-surface-muted">
                  <th className="py-2 pl-4 pr-2">#</th>
                  <th className="py-2 px-2">Player</th>
                  <th className="py-2 px-2">Skill</th>
                  <th className="py-2 px-2">Ladder</th>
                  {isAdmin && <th className="py-2 px-2">Registered By</th>}
                  {isAdmin && <th className="py-2 pl-2 pr-4 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {waitlisted.map(
                  (reg: Registration & { player?: Profile }, idx: number) =>
                    renderPlayerRow(reg, idx, true)
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="No one on the waitlist"
            description="The waitlist is empty."
          />
        )}
      </section>
    </div>
  );
}
