"use client";

import { useSupabase } from "@/components/providers/supabase-provider";
import type { Notification } from "@/types/database";
import { useEffect, useState } from "react";
import { formatDateTime } from "@/lib/utils";

export default function NotificationsPage() {
  const { supabase } = useSupabase();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user.id)
        .single();

      if (!profile) return;

      const { data } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", profile.id)
        .order("created_at", { ascending: false })
        .limit(50);

      setNotifications(data ?? []);
      setLoading(false);
    }
    fetch();
  }, [supabase]);

  async function markAllRead() {
    const unread = notifications.filter((n) => !n.read_at);
    if (unread.length === 0) return;

    const ids = unread.map((n) => n.id);
    await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .in("id", ids);

    setNotifications((prev) =>
      prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() }))
    );
  }

  async function markRead(id: string) {
    await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", id);

    setNotifications((prev) =>
      prev.map((n) =>
        n.id === id ? { ...n, read_at: new Date().toISOString() } : n
      )
    );
  }

  if (loading) return <div className="text-center py-12 text-surface-muted">Loading...</div>;

  const unreadCount = notifications.filter((n) => !n.read_at).length;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-dark-100">Notifications</h1>
          {unreadCount > 0 && (
            <p className="text-sm text-surface-muted">{unreadCount} unread</p>
          )}
        </div>
        {unreadCount > 0 && (
          <button onClick={markAllRead} className="btn-secondary text-sm">
            Mark all read
          </button>
        )}
      </div>

      <div className="space-y-2">
        {notifications.map((n) => (
          <div
            key={n.id}
            onClick={() => !n.read_at && markRead(n.id)}
            className={`card cursor-pointer transition-colors ${
              !n.read_at ? "border-l-4 border-l-brand-500 bg-brand-900/40/30" : ""
            }`}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-dark-100">{n.title}</p>
                <p className="mt-1 text-sm text-surface-muted">{n.body}</p>
              </div>
              <span className="text-xs text-surface-muted whitespace-nowrap ml-4">
                {formatDateTime(n.created_at)}
              </span>
            </div>
            {n.link && (
              <a
                href={n.link}
                className="mt-2 inline-block text-sm text-brand-400 hover:text-brand-300"
                onClick={(e) => e.stopPropagation()}
              >
                View details →
              </a>
            )}
          </div>
        ))}

        {notifications.length === 0 && (
          <div className="text-center py-12 text-surface-muted">
            No notifications yet.
          </div>
        )}
      </div>
    </div>
  );
}
