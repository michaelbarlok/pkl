import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { formatDate, formatTime } from "@/lib/utils";
import type { Registration, Profile } from "@/types/database";
import { SheetActions } from "./sheet-actions";

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

  // Fetch registrations with player profiles
  const { data: registrations } = await supabase
    .from("registrations")
    .select("*, player:profiles(*)")
    .eq("sheet_id", id)
    .in("status", ["confirmed", "waitlist"])
    .order("signed_up_at", { ascending: true });

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
          <h1 className="mt-2 text-2xl font-bold text-gray-900">
            {sheet.group?.name ?? "Event"}
          </h1>
          <p className="mt-1 text-gray-600">{sheet.location}</p>
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
        <div className="rounded-md bg-red-50 p-4 text-red-800">
          This event has been cancelled.
        </div>
      )}

      {/* Event Info */}
      <div className="card">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <p className="text-sm font-medium text-gray-500">Date</p>
            <p className="mt-1 text-gray-900">{formatDate(sheet.event_date)}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500">Time</p>
            <p className="mt-1 text-gray-900">{formatTime(sheet.event_time)}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500">Location</p>
            <p className="mt-1 text-gray-900">{sheet.location}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500">Group</p>
            <p className="mt-1 text-gray-900">{sheet.group?.name ?? "N/A"}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500">Player Limit</p>
            <p className="mt-1 text-gray-900">
              {confirmed.length}/{sheet.player_limit}
              {waitlisted.length > 0 && (
                <span className="ml-2 text-sm text-gray-500">
                  (+{waitlisted.length} waitlisted)
                </span>
              )}
            </p>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500">
              Sign-Up Closes
            </p>
            <p className="mt-1 text-gray-900">
              {formatDate(sheet.signup_closes_at)},{" "}
              {formatTime(sheet.signup_closes_at)}
            </p>
          </div>
          {sheet.withdraw_closes_at && (
            <div>
              <p className="text-sm font-medium text-gray-500">
                Withdraw Deadline
              </p>
              <p className="mt-1 text-gray-900">
                {formatDate(sheet.withdraw_closes_at)},{" "}
                {formatTime(sheet.withdraw_closes_at)}
              </p>
            </div>
          )}
        </div>

        {sheet.notes && (
          <div className="mt-4 border-t pt-4">
            <p className="text-sm font-medium text-gray-500">Notes</p>
            <p className="mt-1 text-gray-700">{sheet.notes}</p>
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

      {/* Confirmed Players */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-900">
            Confirmed Players ({confirmed.length})
          </h2>
          <Link
            href={`/sheets/${id}/roster`}
            className="text-sm text-brand-600 hover:text-brand-500"
          >
            View full roster
          </Link>
        </div>
        {confirmed.length > 0 ? (
          <div className="card divide-y divide-gray-100">
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
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-200 text-sm font-medium text-gray-600">
                    {reg.player?.display_name?.charAt(0) ?? "?"}
                  </div>
                )}
                <span className="text-gray-900">
                  {reg.player?.display_name ?? "Unknown"}
                </span>
                {reg.player?.skill_level && (
                  <span className="badge-blue text-xs">
                    {reg.player.skill_level}
                  </span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="card text-center text-gray-500">
            No confirmed players yet.
          </div>
        )}
      </section>

      {/* Waitlist */}
      {waitlisted.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">
            Waitlist ({waitlisted.length})
          </h2>
          <div className="card divide-y divide-gray-100">
            {waitlisted.map(
              (reg: Registration & { player?: Profile }, idx: number) => (
                <div
                  key={reg.id}
                  className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <span className="text-sm font-medium text-gray-400 w-6 text-right">
                    {idx + 1}.
                  </span>
                  {reg.player?.avatar_url ? (
                    <img
                      src={reg.player.avatar_url}
                      alt=""
                      className="h-8 w-8 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-200 text-sm font-medium text-gray-600">
                      {reg.player?.display_name?.charAt(0) ?? "?"}
                    </div>
                  )}
                  <span className="text-gray-900">
                    {reg.player?.display_name ?? "Unknown"}
                  </span>
                  <span className="badge-yellow text-xs">Waitlisted</span>
                </div>
              )
            )}
          </div>
        </section>
      )}
    </div>
  );
}
