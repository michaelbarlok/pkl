import { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/auth.store";
import { useSessionStore } from "@/store/session.store";
import { AllTimeStats, PlayerSessionState } from "@/types/database";
import { formatWinPct } from "@/lib/utils";

type Tab = "session" | "alltime";

export default function StandingsScreen() {
  const { player } = useAuthStore();
  const { activeSession, upcomingSession, playerStates, fetchPlayerStates, fetchSessions } =
    useSessionStore();

  const [tab, setTab] = useState<Tab>("session");
  const [allTimeStats, setAllTimeStats] = useState<AllTimeStats[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const currentSession = activeSession ?? upcomingSession;

  const loadSessionStandings = async () => {
    if (currentSession) await fetchPlayerStates(currentSession.id);
  };

  const loadAllTimeStats = async () => {
    const { data } = await supabase
      .from("all_time_stats")
      .select("*")
      .order("win_percentage", { ascending: false })
      .order("total_wins", { ascending: false });

    if (data) setAllTimeStats(data as AllTimeStats[]);
  };

  const loadData = async () => {
    setLoading(true);
    await fetchSessions();
    await Promise.all([loadSessionStandings(), loadAllTimeStats()]);
    setLoading(false);
  };

  useEffect(() => { loadData(); }, [currentSession?.id]);

  // Realtime subscriptions
  useEffect(() => {
    if (!currentSession) return;
    const sub = supabase
      .channel(`standings:${currentSession.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "player_session_states" },
        loadSessionStandings
      )
      .subscribe();

    return () => { sub.unsubscribe(); };
  }, [currentSession?.id]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const sortedStates = [...playerStates].sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    return a.losses - b.losses;
  });

  return (
    <SafeAreaView className="flex-1 bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <View className="px-5 pt-4 pb-2">
        <Text className="text-2xl font-bold text-gray-900 dark:text-white">
          Standings 🏆
        </Text>
      </View>

      {/* Tabs */}
      <View className="flex-row mx-5 mt-3 mb-2 bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
        <TouchableOpacity
          onPress={() => setTab("session")}
          className={`flex-1 py-2.5 rounded-lg items-center ${
            tab === "session" ? "bg-white dark:bg-gray-700 shadow-sm" : ""
          }`}
        >
          <Text
            className={`font-semibold text-sm ${
              tab === "session"
                ? "text-gray-900 dark:text-white"
                : "text-gray-500 dark:text-gray-400"
            }`}
          >
            This Session
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setTab("alltime")}
          className={`flex-1 py-2.5 rounded-lg items-center ${
            tab === "alltime" ? "bg-white dark:bg-gray-700 shadow-sm" : ""
          }`}
        >
          <Text
            className={`font-semibold text-sm ${
              tab === "alltime"
                ? "text-gray-900 dark:text-white"
                : "text-gray-500 dark:text-gray-400"
            }`}
          >
            All Time
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={{ paddingBottom: 32, paddingHorizontal: 20 }}
      >
        {loading ? (
          <View className="py-12 items-center">
            <ActivityIndicator size="large" color="#16a34a" />
          </View>
        ) : tab === "session" ? (
          <>
            {sortedStates.length === 0 ? (
              <View className="py-12 items-center">
                <Text className="text-4xl mb-3">📊</Text>
                <Text className="text-gray-500 dark:text-gray-400 text-center">
                  Session standings will appear here once a session is active.
                </Text>
              </View>
            ) : (
              <>
                {/* Column Headers */}
                <View className="flex-row items-center px-3 pb-2 mt-2">
                  <Text className="text-xs text-gray-400 w-8">#</Text>
                  <Text className="text-xs text-gray-400 flex-1">Player</Text>
                  <Text className="text-xs text-gray-400 w-10 text-center">W</Text>
                  <Text className="text-xs text-gray-400 w-10 text-center">L</Text>
                  <Text className="text-xs text-gray-400 w-12 text-center">Win%</Text>
                  <Text className="text-xs text-gray-400 w-14 text-right">Court</Text>
                </View>

                {sortedStates.map((state, index) => {
                  const isMe = state.player_id === player?.id;
                  return (
                    <View
                      key={state.id}
                      className={`flex-row items-center px-3 py-3 mb-1.5 rounded-xl ${
                        isMe
                          ? "bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800"
                          : "bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800"
                      }`}
                    >
                      <Text className="text-sm text-gray-500 dark:text-gray-400 w-8">
                        {index + 1}
                      </Text>
                      <Text
                        className={`text-sm flex-1 font-medium ${
                          isMe
                            ? "text-green-700 dark:text-green-400"
                            : "text-gray-900 dark:text-white"
                        }`}
                        numberOfLines={1}
                      >
                        {state.player?.full_name ?? "Unknown"}
                        {isMe && " (you)"}
                      </Text>
                      <Text className="text-sm text-gray-900 dark:text-white w-10 text-center font-semibold">
                        {state.wins}
                      </Text>
                      <Text className="text-sm text-gray-500 dark:text-gray-400 w-10 text-center">
                        {state.losses}
                      </Text>
                      <Text className="text-sm text-gray-700 dark:text-gray-300 w-12 text-center">
                        {formatWinPct(state.wins, state.losses)}
                      </Text>
                      <View className="w-14 items-end">
                        <View className="bg-green-100 dark:bg-green-900/30 rounded-full px-2 py-0.5">
                          <Text className="text-green-700 dark:text-green-400 text-xs font-semibold">
                            C{state.current_court}
                          </Text>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </>
            )}
          </>
        ) : (
          <>
            {allTimeStats.length === 0 ? (
              <View className="py-12 items-center">
                <Text className="text-4xl mb-3">📊</Text>
                <Text className="text-gray-500 dark:text-gray-400 text-center">
                  All-time stats will appear after sessions are played.
                </Text>
              </View>
            ) : (
              <>
                <View className="flex-row items-center px-3 pb-2 mt-2">
                  <Text className="text-xs text-gray-400 w-8">#</Text>
                  <Text className="text-xs text-gray-400 flex-1">Player</Text>
                  <Text className="text-xs text-gray-400 w-10 text-center">W</Text>
                  <Text className="text-xs text-gray-400 w-10 text-center">L</Text>
                  <Text className="text-xs text-gray-400 w-12 text-center">Win%</Text>
                  <Text className="text-xs text-gray-400 w-16 text-right">Sessions</Text>
                </View>

                {allTimeStats.map((stats, index) => {
                  const isMe = stats.player_id === player?.id;
                  return (
                    <View
                      key={stats.player_id}
                      className={`flex-row items-center px-3 py-3 mb-1.5 rounded-xl ${
                        isMe
                          ? "bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800"
                          : "bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800"
                      }`}
                    >
                      <Text className="text-sm text-gray-500 dark:text-gray-400 w-8">
                        {index + 1}
                      </Text>
                      <Text
                        className={`text-sm flex-1 font-medium ${
                          isMe
                            ? "text-green-700 dark:text-green-400"
                            : "text-gray-900 dark:text-white"
                        }`}
                        numberOfLines={1}
                      >
                        {stats.full_name ?? "Unknown"}
                        {isMe && " (you)"}
                      </Text>
                      <Text className="text-sm text-gray-900 dark:text-white w-10 text-center font-semibold">
                        {stats.total_wins}
                      </Text>
                      <Text className="text-sm text-gray-500 dark:text-gray-400 w-10 text-center">
                        {stats.total_losses}
                      </Text>
                      <Text className="text-sm text-gray-700 dark:text-gray-300 w-12 text-center">
                        {formatWinPct(stats.total_wins, stats.total_losses)}
                      </Text>
                      <Text className="text-sm text-gray-500 dark:text-gray-400 w-16 text-right">
                        {stats.sessions_played}
                      </Text>
                    </View>
                  );
                })}
              </>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
