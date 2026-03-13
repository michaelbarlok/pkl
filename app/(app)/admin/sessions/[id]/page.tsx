"use client";

import { useSupabase } from "@/components/providers/supabase-provider";
import type { ShootoutSession, SessionParticipant, ShootoutGroup } from "@/types/database";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type SessionWithRelations = ShootoutSession & {
  group: ShootoutGroup;
  sheet: { event_date: string; location: string };
};

const LIFECYCLE_ORDER = [
  "created",
  "checking_in",
  "seeding",
  "round_active",
  "round_complete",
  "session_complete",
] as const;

const STATUS_LABELS: Record<string, string> = {
  created: "Created",
  checking_in: "Check-In",
  seeding: "Seeding",
  round_active: "Round Active",
  round_complete: "Round Complete",
  session_complete: "Session Complete",
};

export default function AdminSessionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { supabase } = useSupabase();
  const router = useRouter();
  const [session, setSession] = useState<SessionWithRelations | null>(null);
  const [participants, setParticipants] = useState<SessionParticipant[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    async function fetch() {
      const { data: s } = await supabase
        .from("shootout_sessions")
        .select("*, group:shootout_groups(*), sheet:signup_sheets(event_date, location)")
        .eq("id", id)
        .single();
      setSession(s as SessionWithRelations);

      const { data: p } = await supabase
        .from("session_participants")
        .select("*, player:profiles(id, display_name, avatar_url)")
        .eq("session_id", id)
        .order("court_number", { ascending: true });
      setParticipants(p ?? []);
      setLoading(false);
    }
    fetch();
  }, [id, supabase]);

  async function advanceStatus() {
    if (!session) return;
    const currentIdx = LIFECYCLE_ORDER.indexOf(session.status as typeof LIFECYCLE_ORDER[number]);
    if (currentIdx >= LIFECYCLE_ORDER.length - 1) return;
    const nextStatus = LIFECYCLE_ORDER[currentIdx + 1];

    setUpdating(true);

    // On round_complete → call step update function
    if (nextStatus === "round_complete") {
      await supabase.rpc("update_steps_on_round_complete", { p_session_id: id });
    }

    await supabase
      .from("shootout_sessions")
      .update({ status: nextStatus })
      .eq("id", id);

    // Re-fetch participants to pick up step_after changes
    const { data: refreshed } = await supabase
      .from("session_participants")
      .select("*, player:profiles(id, display_name, avatar_url)")
      .eq("session_id", id)
      .order("court_number", { ascending: true });
    if (refreshed) setParticipants(refreshed);

    setSession({ ...session, status: nextStatus });
    setUpdating(false);
  }

  // Realtime: re-fetch participants when session_participants change (e.g. step updates)
  useEffect(() => {
    const channel = supabase
      .channel(`admin-session-${id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "session_participants", filter: `session_id=eq.${id}` },
        () => {
          supabase
            .from("session_participants")
            .select("*, player:profiles(id, display_name, avatar_url)")
            .eq("session_id", id)
            .order("court_number", { ascending: true })
            .then(({ data }) => {
              if (data) setParticipants(data);
            });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, supabase]);

  async function deleteSession() {
    if (!session) return;
    if (!confirm("Delete this session? All participant data will be lost. You can start a new session from the sign up sheet.")) return;

    setDeleting(true);
    try {
      // Delete participants first, then the session
      await supabase
        .from("session_participants")
        .delete()
        .eq("session_id", id);

      await supabase
        .from("shootout_sessions")
        .delete()
        .eq("id", id);

      // Redirect back to the sheet
      if (session.sheet_id) {
        router.push(`/sheets/${session.sheet_id}`);
      } else {
        router.push("/admin/sessions");
      }
    } catch {
      setDeleting(false);
      alert("Failed to delete session.");
    }
  }

  if (loading) return <div className="text-center py-12 text-surface-muted">Loading...</div>;
  if (!session) return <div className="text-center py-12 text-surface-muted">Session not found.</div>;

  const currentIdx = LIFECYCLE_ORDER.indexOf(session.status as typeof LIFECYCLE_ORDER[number]);
  const checkedInCount = participants.filter((p) => p.checked_in).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-dark-100">
            Session — {session.group?.name}
          </h1>
          <p className="text-sm text-surface-muted">
            {session.sheet?.event_date &&
              new Date(session.sheet.event_date).toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
            {" at "}
            {session.sheet?.location}
          </p>
        </div>
      </div>

      {/* Lifecycle Progress */}
      <div className="card">
        <h2 className="text-sm font-semibold text-dark-200 mb-4">Session Lifecycle</h2>
        <div className="flex items-center gap-2 overflow-x-auto">
          {LIFECYCLE_ORDER.map((status, idx) => (
            <div key={status} className="flex items-center">
              <div
                className={`rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap ${
                  idx < currentIdx
                    ? "bg-teal-900/30 text-teal-300"
                    : idx === currentIdx
                    ? "bg-brand-900/50 text-brand-300 ring-2 ring-brand-500"
                    : "bg-surface-overlay text-surface-muted"
                }`}
              >
                {STATUS_LABELS[status]}
              </div>
              {idx < LIFECYCLE_ORDER.length - 1 && (
                <svg className="mx-1 h-4 w-4 text-surface-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div className="card">
          <p className="text-sm text-surface-muted">Players</p>
          <p className="text-2xl font-bold">{participants.length}</p>
        </div>
        <div className="card">
          <p className="text-sm text-surface-muted">Checked In</p>
          <p className="text-2xl font-bold">{checkedInCount}</p>
        </div>
        <div className="card">
          <p className="text-sm text-surface-muted">Courts</p>
          <p className="text-2xl font-bold">{session.num_courts}</p>
        </div>
        <div className="card">
          <p className="text-sm text-surface-muted">Round</p>
          <p className="text-2xl font-bold">{session.current_round}</p>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="card">
        <h2 className="text-sm font-semibold text-dark-200 mb-4">Actions</h2>
        <div className="flex flex-wrap gap-3">
          {session.status === "created" && (
            <Link href={`/admin/sessions/${id}/checkin`} className="btn-primary">
              Start Check-In
            </Link>
          )}
          {session.status === "checking_in" && (
            <Link href={`/admin/sessions/${id}/checkin`} className="btn-primary">
              Manage Check-In
            </Link>
          )}
          {session.status !== "session_complete" && (
            <button onClick={advanceStatus} className="btn-secondary" disabled={updating}>
              {updating ? "Updating..." : `Advance to ${STATUS_LABELS[LIFECYCLE_ORDER[currentIdx + 1]] ?? "—"}`}
            </button>
          )}
          {session.status === "session_complete" && (
            <span className="badge-green text-sm">Session Complete</span>
          )}
          <button
            onClick={deleteSession}
            disabled={deleting}
            className="btn-secondary !border-red-500/50 !text-red-400 hover:!bg-red-900/20"
          >
            {deleting ? "Deleting..." : "Delete Session"}
          </button>
        </div>
      </div>

      {/* Participants Table */}
      <div className="card overflow-hidden p-0">
        <div className="px-6 py-4 border-b border-surface-border">
          <h2 className="text-sm font-semibold text-dark-200">Participants</h2>
        </div>
        <table className="min-w-full divide-y divide-surface-border">
          <thead className="bg-surface-overlay">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase text-surface-muted">Player</th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase text-surface-muted">Checked In</th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase text-surface-muted">Court</th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase text-surface-muted">Step Before</th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase text-surface-muted">Step After</th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase text-surface-muted">Finish</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border bg-surface-raised">
            {participants.map((p) => (
              <tr key={p.id}>
                <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-dark-100">
                  {(p as any).player?.display_name ?? "Unknown"}
                </td>
                <td className="whitespace-nowrap px-6 py-4">
                  {p.checked_in ? (
                    <span className="badge-green">Yes</span>
                  ) : (
                    <span className="badge-gray">No</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-6 py-4 text-sm text-dark-200">
                  {p.court_number ?? "—"}
                </td>
                <td className="whitespace-nowrap px-6 py-4 text-sm text-dark-200">
                  {p.step_before}
                </td>
                <td className="whitespace-nowrap px-6 py-4 text-sm text-dark-200">
                  {p.step_after != null ? (
                    <span className={p.step_after < p.step_before ? "text-teal-300 font-medium" : p.step_after > p.step_before ? "text-red-400 font-medium" : ""}>
                      {p.step_after}
                      {p.step_after < p.step_before && " ↑"}
                      {p.step_after > p.step_before && " ↓"}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="whitespace-nowrap px-6 py-4 text-sm text-dark-200">
                  {p.pool_finish != null ? `${p.pool_finish}${["st","nd","rd"][p.pool_finish-1] ?? "th"}` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
