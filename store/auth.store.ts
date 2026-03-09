import { create } from "zustand";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { Player } from "@/types/database";

interface AuthState {
  session: Session | null;
  user: User | null;
  player: Player | null;
  loading: boolean;
  setSession: (session: Session | null) => void;
  setPlayer: (player: Player | null) => void;
  fetchPlayer: () => Promise<void>;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  user: null,
  player: null,
  loading: true,

  setSession: (session) => {
    set({ session, user: session?.user ?? null, loading: false });
  },

  setPlayer: (player) => set({ player }),

  fetchPlayer: async () => {
    const { user } = get();
    if (!user) return;

    const { data } = await supabase
      .from("players")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (data) set({ player: data as Player });
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ session: null, user: null, player: null });
  },
}));
