"use client";

import { useSupabase } from "@/components/providers/supabase-provider";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { Notification } from "@/types/database";
import { formatDateTime } from "@/lib/utils";

export function NotificationBell({ profileId }: { profileId: string }) {
  const { supabase } = useSupabase();
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loadingNotifs, setLoadingNotifs] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  // Initial unread count + realtime subscription
  useEffect(() => {
    async function fetchCount() {
      const { count } = await supabase
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("user_id", profileId)
        .is("read_at", null);
      setUnreadCount(count ?? 0);
    }
    fetchCount();

    const channel = supabase
      .channel(`notif-bell-${profileId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${profileId}` }, () => {
        setUnreadCount((prev) => prev + 1);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "notifications", filter: `user_id=eq.${profileId}` }, (payload) => {
        if (payload.new.read_at && !payload.old.read_at) {
          setUnreadCount((prev) => Math.max(0, prev - 1));
          setNotifications((prev) => prev.map((n) => n.id === payload.new.id ? { ...n, read_at: payload.new.read_at } : n));
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [supabase, profileId]);

  async function fetchNotifications() {
    setLoadingNotifs(true);
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", profileId)
      .order("created_at", { ascending: false })
      .limit(25);
    setNotifications(data ?? []);
    setLoadingNotifs(false);
  }

  useEffect(() => {
    if (open) fetchNotifications();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  async function markAllRead() {
    const unread = notifications.filter((n) => !n.read_at);
    if (!unread.length) return;
    const ids = unread.map((n) => n.id);
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).in("id", ids);
    setNotifications((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
    setUnreadCount(0);
  }

  async function markRead(id: string) {
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id);
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read_at: new Date().toISOString() } : n));
    setUnreadCount((prev) => Math.max(0, prev - 1));
  }

  const panel = open && mounted ? createPortal(
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/40" onClick={() => setOpen(false)} />

      {/* Slide-in drawer */}
      <div className="fixed top-0 right-0 z-50 flex h-full w-full max-w-sm flex-col bg-surface-raised border-l border-surface-border shadow-2xl animate-slide-in-right">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-surface-border px-4 py-3">
          <div>
            <h2 className="font-semibold text-dark-100">Notifications</h2>
            {unreadCount > 0 && (
              <p className="text-xs text-surface-muted">{unreadCount} unread</p>
            )}
          </div>
          <div className="flex items-center gap-3">
            {unreadCount > 0 && (
              <button onClick={markAllRead} className="text-xs text-brand-400 hover:text-brand-300 transition-colors">
                Mark all read
              </button>
            )}
            <button
              onClick={() => setOpen(false)}
              className="flex h-7 w-7 items-center justify-center rounded-md text-surface-muted hover:bg-surface-overlay hover:text-dark-100 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {loadingNotifs ? (
            <div className="space-y-px p-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="skeleton h-16 rounded-lg mb-2" />
              ))}
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full px-6 py-16 text-center">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-10 w-10 text-surface-border mb-3">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              <p className="text-sm text-surface-muted">No notifications yet</p>
            </div>
          ) : (
            <div className="divide-y divide-surface-border">
              {notifications.map((n) => (
                <div
                  key={n.id}
                  onClick={() => !n.read_at && markRead(n.id)}
                  className={`px-4 py-3 transition-colors hover:bg-surface-overlay ${
                    !n.read_at ? "cursor-pointer border-l-2 border-l-brand-500 bg-brand-900/20" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm font-medium leading-snug ${!n.read_at ? "text-dark-100" : "text-dark-200"}`}>
                        {n.title}
                      </p>
                      <p className="mt-0.5 text-xs text-surface-muted line-clamp-2">{n.body}</p>
                      {n.link && (
                        <a
                          href={n.link}
                          className="mt-1 inline-block text-xs text-brand-400 hover:text-brand-300"
                          onClick={(e) => e.stopPropagation()}
                        >
                          View →
                        </a>
                      )}
                    </div>
                    <span className="shrink-0 text-xs text-surface-muted whitespace-nowrap">
                      {formatDateTime(n.created_at)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-surface-border p-3">
          <a
            href="/notifications"
            className="block rounded-lg py-2 text-center text-sm text-brand-400 hover:bg-surface-overlay hover:text-brand-300 transition-colors"
          >
            View all notifications
          </a>
        </div>
      </div>
    </>,
    document.body
  ) : null;

  return (
    <>
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="relative p-2 text-dark-300 hover:text-dark-100 transition-colors"
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
        aria-expanded={open}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>
      {panel}
    </>
  );
}
