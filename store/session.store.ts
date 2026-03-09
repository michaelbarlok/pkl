import { create } from "zustand";
import { supabase } from "@/lib/supabase";
import { Session, SignUp, Round, Match, PlayerSessionState } from "@/types/database";

interface SessionState {
  sessions: Session[];
  upcomingSession: Session | null;
  activeSession: Session | null;
  mySignUps: SignUp[];
  signUps: SignUp[];
  currentRound: Round | null;
  matches: Match[];
  playerStates: PlayerSessionState[];
  loading: boolean;

  fetchSessions: () => Promise<void>;
  fetchSignUps: (sessionId: string) => Promise<void>;
  fetchMySignUps: (playerId: string) => Promise<void>;
  signUpForSession: (sessionId: string, playerId: string) => Promise<{ error?: string }>;
  withdrawFromSession: (sessionId: string, playerId: string) => Promise<{ error?: string }>;
  fetchCurrentRound: (sessionId: string) => Promise<void>;
  fetchMatches: (roundId: string) => Promise<void>;
  fetchPlayerStates: (sessionId: string) => Promise<void>;
  enterScore: (matchId: string, team1Score: number, team2Score: number, enteredBy: string) => Promise<{ error?: string }>;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  sessions: [],
  upcomingSession: null,
  activeSession: null,
  mySignUps: [],
  signUps: [],
  currentRound: null,
  matches: [],
  playerStates: [],
  loading: false,

  fetchSessions: async () => {
    set({ loading: true });
    const { data } = await supabase
      .from("sessions")
      .select("*")
      .order("date", { ascending: true });

    if (data) {
      const sessions = data as Session[];
      const now = new Date();
      const upcoming = sessions.find(
        (s) => s.status === "upcoming" && new Date(s.date) >= now
      ) ?? null;
      const active = sessions.find((s) => s.status === "active") ?? null;
      set({ sessions, upcomingSession: upcoming, activeSession: active });
    }
    set({ loading: false });
  },

  fetchSignUps: async (sessionId) => {
    const { data } = await supabase
      .from("sign_ups")
      .select("*, player:players(*)")
      .eq("session_id", sessionId)
      .neq("status", "withdrawn")
      .order("signed_up_at", { ascending: true });

    if (data) set({ signUps: data as SignUp[] });
  },

  fetchMySignUps: async (playerId) => {
    const { data } = await supabase
      .from("sign_ups")
      .select("*, session:sessions(*)")
      .eq("player_id", playerId)
      .neq("status", "withdrawn");

    if (data) set({ mySignUps: data as SignUp[] });
  },

  signUpForSession: async (sessionId, playerId) => {
    const { data, error } = await supabase.rpc("sign_up_for_session", {
      p_session_id: sessionId,
      p_player_id: playerId,
    });

    if (error) return { error: error.message };

    await get().fetchMySignUps(playerId);
    return {};
  },

  withdrawFromSession: async (sessionId, playerId) => {
    const { error } = await supabase.rpc("withdraw_from_session", {
      p_session_id: sessionId,
      p_player_id: playerId,
    });

    if (error) return { error: error.message };

    await get().fetchMySignUps(playerId);
    return {};
  },

  fetchCurrentRound: async (sessionId) => {
    const { data } = await supabase
      .from("rounds")
      .select("*")
      .eq("session_id", sessionId)
      .is("completed_at", null)
      .order("round_number", { ascending: false })
      .limit(1)
      .single();

    if (data) set({ currentRound: data as Round });
  },

  fetchMatches: async (roundId) => {
    const { data } = await supabase
      .from("matches")
      .select("*, court:courts(*)")
      .eq("round_id", roundId)
      .order("court_id");

    if (data) set({ matches: data as Match[] });
  },

  fetchPlayerStates: async (sessionId) => {
    const { data } = await supabase
      .from("player_session_states")
      .select("*, player:players(*)")
      .eq("session_id", sessionId)
      .order("wins", { ascending: false });

    if (data) set({ playerStates: data as PlayerSessionState[] });
  },

  enterScore: async (matchId, team1Score, team2Score, enteredBy) => {
    const { error } = await supabase
      .from("matches")
      .update({
        team1_score: team1Score,
        team2_score: team2Score,
        score_entered_by: enteredBy,
        score_entered_at: new Date().toISOString(),
      })
      .eq("id", matchId);

    if (error) return { error: error.message };
    return {};
  },
}));
