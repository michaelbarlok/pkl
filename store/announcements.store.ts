import { create } from "zustand";
import { supabase } from "@/lib/supabase";
import { Announcement } from "@/types/database";

interface AnnouncementsState {
  announcements: Announcement[];
  unreadCount: number;
  loading: boolean;
  fetchAnnouncements: () => Promise<void>;
  markAllRead: () => void;
}

export const useAnnouncementsStore = create<AnnouncementsState>((set) => ({
  announcements: [],
  unreadCount: 0,
  loading: false,

  fetchAnnouncements: async () => {
    set({ loading: true });
    const { data } = await supabase
      .from("announcements")
      .select("*, sender:players!sent_by(full_name)")
      .order("sent_at", { ascending: false })
      .limit(50);

    if (data) set({ announcements: data as Announcement[] });
    set({ loading: false });
  },

  markAllRead: () => set({ unreadCount: 0 }),
}));
