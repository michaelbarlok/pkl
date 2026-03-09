import { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
  TextInput,
  Modal,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuthStore } from "@/store/auth.store";
import { useSessionStore } from "@/store/session.store";
import { supabase } from "@/lib/supabase";
import { Match, AllTimeStats } from "@/types/database";
import { courtLabel, formatWinPct } from "@/lib/utils";

// ─── Sub-section types ───────────────────────────────────────────────────────

type PlaySection =
  | "create-shootout"
  | "join-active"
  | "list-shootouts"
  | "player-ranking"
  | "message-players"
  | "reset-scores"
  | "preferences";

const ALL_SECTIONS: { key: PlaySection; label: string; adminOnly: boolean }[] =
  [
    { key: "create-shootout", label: "Create Shootout", adminOnly: true },
    { key: "join-active", label: "Join Active Shootout", adminOnly: false },
    { key: "list-shootouts", label: "List Shootouts", adminOnly: false },
    { key: "player-ranking", label: "Player Ranking", adminOnly: false },
    { key: "message-players", label: "Message Players", adminOnly: true },
    { key: "reset-scores", label: "Reset Scores", adminOnly: true },
    { key: "preferences", label: "Preferences", adminOnly: true },
  ];

// ─── Placeholder section ─────────────────────────────────────────────────────

function ComingSoon({ title }: { title: string }) {
  return (
    <View className="flex-1 items-center justify-center py-20">
      <Text className="text-5xl mb-4">🚧</Text>
      <Text className="text-lg font-semibold text-gray-900 dark:text-white">
        {title}
      </Text>
      <Text className="text-gray-500 dark:text-gray-400 text-center mt-2 px-8">
        This section is coming soon.
      </Text>
    </View>
  );
}

// ─── Join Active Shootout (Live) ─────────────────────────────────────────────

function JoinActiveSection() {
  const { player } = useAuthStore();
  const {
    activeSession,
    currentRound,
    matches,
    playerStates,
    fetchSessions,
    fetchCurrentRound,
    fetchMatches,
    fetchPlayerStates,
    enterScore,
  } = useSessionStore();

  const [refreshing, setRefreshing] = useState(false);
  const [scoreModal, setScoreModal] = useState<Match | null>(null);
  const [team1Score, setTeam1Score] = useState("");
  const [team2Score, setTeam2Score] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadData = async () => {
    await fetchSessions();
    if (activeSession) {
      await Promise.all([
        fetchCurrentRound(activeSession.id),
        fetchPlayerStates(activeSession.id),
      ]);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeSession?.id]);

  useEffect(() => {
    if (currentRound) fetchMatches(currentRound.id);
  }, [currentRound?.id]);

  useEffect(() => {
    if (!currentRound) return;
    const sub = supabase
      .channel(`matches:round:${currentRound.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "matches" },
        () => fetchMatches(currentRound.id)
      )
      .subscribe();
    return () => { sub.unsubscribe(); };
  }, [currentRound?.id]);

  const myMatch = matches.find(
    (m) =>
      m.team1_player_ids.includes(player?.id ?? "") ||
      m.team2_player_ids.includes(player?.id ?? "")
  );

  const getPlayerNames = (ids: string[]) =>
    ids
      .map((id) => {
        const state = playerStates.find((ps) => ps.player_id === id);
        return state?.player?.full_name?.split(" ")[0] ?? "?";
      })
      .join(" & ");

  const openScoreEntry = (match: Match) => {
    setScoreModal(match);
    setTeam1Score(match.team1_score?.toString() ?? "");
    setTeam2Score(match.team2_score?.toString() ?? "");
  };

  const submitScore = async () => {
    if (!scoreModal || !player) return;
    const t1 = parseInt(team1Score);
    const t2 = parseInt(team2Score);
    if (isNaN(t1) || isNaN(t2) || t1 < 0 || t2 < 0) {
      Alert.alert("Invalid Score", "Please enter valid scores.");
      return;
    }
    setSubmitting(true);
    const { error } = await enterScore(scoreModal.id, t1, t2, player.id);
    setSubmitting(false);
    if (error) {
      Alert.alert("Error", error);
    } else {
      setScoreModal(null);
      if (currentRound) fetchMatches(currentRound.id);
    }
  };

  if (!activeSession) {
    return (
      <View className="flex-1 items-center justify-center py-20">
        <Text className="text-4xl mb-4">😴</Text>
        <Text className="text-lg font-semibold text-gray-900 dark:text-white">
          No active session
        </Text>
        <Text className="text-gray-500 dark:text-gray-400 text-center mt-2 px-8">
          Live court data will appear here once a session is started.
        </Text>
      </View>
    );
  }

  return (
    <>
      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await loadData();
              setRefreshing(false);
            }}
          />
        }
        contentContainerStyle={{ paddingBottom: 32, paddingHorizontal: 20 }}
      >
        {/* Header */}
        <View className="flex-row items-center justify-between pt-3 pb-2">
          <View>
            <Text className="text-xl font-bold text-gray-900 dark:text-white">
              Live 🎾
            </Text>
            {currentRound && (
              <Text className="text-green-600 dark:text-green-400 font-medium text-sm">
                Round {currentRound.round_number} in progress
              </Text>
            )}
          </View>
          <View className="bg-red-500 rounded-full px-3 py-1">
            <Text className="text-white text-xs font-bold">LIVE</Text>
          </View>
        </View>

        {/* My Match */}
        {myMatch && (
          <View className="mt-3 bg-green-600 rounded-2xl p-4">
            <Text className="text-green-100 text-xs font-semibold mb-2">
              YOUR MATCH
            </Text>
            <View className="bg-white/20 rounded-xl p-3">
              <View className="flex-row justify-between items-center">
                <Text className="text-white font-bold flex-1">
                  {getPlayerNames(myMatch.team1_player_ids)}
                </Text>
                <Text className="text-white font-bold text-lg mx-3">
                  {myMatch.team1_score ?? "–"} : {myMatch.team2_score ?? "–"}
                </Text>
                <Text className="text-white font-bold flex-1 text-right">
                  {getPlayerNames(myMatch.team2_player_ids)}
                </Text>
              </View>
            </View>
            {myMatch.team1_score == null && (
              <TouchableOpacity
                onPress={() => openScoreEntry(myMatch)}
                className="bg-white rounded-xl py-2.5 items-center mt-3"
              >
                <Text className="text-green-700 font-bold">Enter Score</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* All Courts */}
        <Text className="text-sm font-semibold text-gray-700 dark:text-gray-300 mt-5 mb-3">
          All Courts — Round {currentRound?.round_number ?? "–"}
        </Text>
        {matches.length === 0 ? (
          <View className="bg-white dark:bg-gray-900 rounded-xl p-6 items-center border border-gray-100 dark:border-gray-800">
            <Text className="text-gray-500 dark:text-gray-400">
              No matches yet for this round
            </Text>
          </View>
        ) : (
          matches.map((match) => (
            <View
              key={match.id}
              className="bg-white dark:bg-gray-900 rounded-xl p-4 mb-3 border border-gray-100 dark:border-gray-800"
            >
              <Text className="text-xs font-semibold text-green-600 mb-2">
                {courtLabel(match.court?.court_number ?? 0)}
              </Text>
              <View className="flex-row items-center justify-between">
                <Text className="text-gray-900 dark:text-white font-medium flex-1">
                  {getPlayerNames(match.team1_player_ids)}
                </Text>
                <View className="mx-3 items-center">
                  {match.team1_score != null ? (
                    <Text className="text-xl font-bold text-gray-900 dark:text-white">
                      {match.team1_score} – {match.team2_score}
                    </Text>
                  ) : (
                    <Text className="text-gray-400">vs</Text>
                  )}
                </View>
                <Text className="text-gray-900 dark:text-white font-medium flex-1 text-right">
                  {getPlayerNames(match.team2_player_ids)}
                </Text>
              </View>
              {match.team1_score == null && (
                <TouchableOpacity
                  onPress={() => openScoreEntry(match)}
                  className="mt-3 border border-green-500 rounded-lg py-2 items-center"
                >
                  <Text className="text-green-600 dark:text-green-400 text-sm font-medium">
                    Enter Score
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          ))
        )}
      </ScrollView>

      {/* Score Entry Modal */}
      <Modal
        visible={!!scoreModal}
        transparent
        animationType="slide"
        onRequestClose={() => setScoreModal(null)}
      >
        <View className="flex-1 bg-black/50 justify-end">
          <View className="bg-white dark:bg-gray-900 rounded-t-3xl p-6">
            <Text className="text-xl font-bold text-gray-900 dark:text-white mb-1">
              Enter Score
            </Text>
            <Text className="text-gray-500 dark:text-gray-400 mb-6">
              {scoreModal && courtLabel(scoreModal.court?.court_number ?? 0)}
            </Text>
            <View className="flex-row items-center justify-center space-x-4 mb-6">
              <View className="flex-1">
                <Text className="text-xs text-gray-500 dark:text-gray-400 text-center mb-2">
                  {scoreModal ? getPlayerNames(scoreModal.team1_player_ids) : ""}
                </Text>
                <TextInput
                  className="bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white text-center text-3xl font-bold py-4 rounded-xl"
                  value={team1Score}
                  onChangeText={setTeam1Score}
                  keyboardType="number-pad"
                  maxLength={2}
                  placeholder="0"
                  placeholderTextColor="#9ca3af"
                />
              </View>
              <Text className="text-2xl font-bold text-gray-400">–</Text>
              <View className="flex-1">
                <Text className="text-xs text-gray-500 dark:text-gray-400 text-center mb-2">
                  {scoreModal ? getPlayerNames(scoreModal.team2_player_ids) : ""}
                </Text>
                <TextInput
                  className="bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white text-center text-3xl font-bold py-4 rounded-xl"
                  value={team2Score}
                  onChangeText={setTeam2Score}
                  keyboardType="number-pad"
                  maxLength={2}
                  placeholder="0"
                  placeholderTextColor="#9ca3af"
                />
              </View>
            </View>
            <TouchableOpacity
              onPress={submitScore}
              disabled={submitting}
              className="bg-green-600 rounded-xl py-4 items-center mb-3"
            >
              {submitting ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text className="text-white font-bold text-base">Submit Score</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setScoreModal(null)}
              className="py-3 items-center"
            >
              <Text className="text-gray-500 dark:text-gray-400">Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

// ─── Player Ranking (Standings) ──────────────────────────────────────────────

function PlayerRankingSection() {
  const { player } = useAuthStore();
  const { activeSession, upcomingSession, playerStates, fetchPlayerStates, fetchSessions } =
    useSessionStore();

  type RankTab = "session" | "alltime";
  const [rankTab, setRankTab] = useState<RankTab>("session");
  const [allTimeStats, setAllTimeStats] = useState<AllTimeStats[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const currentSession = activeSession ?? upcomingSession;

  const loadData = async () => {
    setLoading(true);
    await fetchSessions();
    if (currentSession) await fetchPlayerStates(currentSession.id);
    const { data } = await supabase
      .from("all_time_stats")
      .select("*")
      .order("win_percentage", { ascending: false })
      .order("total_wins", { ascending: false });
    if (data) setAllTimeStats(data as AllTimeStats[]);
    setLoading(false);
  };

  useEffect(() => { loadData(); }, [currentSession?.id]);

  useEffect(() => {
    if (!currentSession) return;
    const sub = supabase
      .channel(`standings:${currentSession.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "player_session_states" },
        () => fetchPlayerStates(currentSession.id)
      )
      .subscribe();
    return () => { sub.unsubscribe(); };
  }, [currentSession?.id]);

  const sortedStates = [...playerStates].sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    return a.losses - b.losses;
  });

  return (
    <ScrollView
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await loadData();
            setRefreshing(false);
          }}
        />
      }
      contentContainerStyle={{ paddingBottom: 32, paddingHorizontal: 20 }}
    >
      {/* Sub-tabs */}
      <View className="flex-row mt-3 mb-4 bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
        {(["session", "alltime"] as RankTab[]).map((t) => (
          <TouchableOpacity
            key={t}
            onPress={() => setRankTab(t)}
            className={`flex-1 py-2.5 rounded-lg items-center ${
              rankTab === t ? "bg-white dark:bg-gray-700 shadow-sm" : ""
            }`}
          >
            <Text
              className={`font-semibold text-sm ${
                rankTab === t
                  ? "text-gray-900 dark:text-white"
                  : "text-gray-500 dark:text-gray-400"
              }`}
            >
              {t === "session" ? "This Session" : "All Time"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View className="py-12 items-center">
          <ActivityIndicator size="large" color="#16a34a" />
        </View>
      ) : rankTab === "session" ? (
        sortedStates.length === 0 ? (
          <View className="py-12 items-center">
            <Text className="text-4xl mb-3">📊</Text>
            <Text className="text-gray-500 dark:text-gray-400 text-center">
              Session standings appear once a session is active.
            </Text>
          </View>
        ) : (
          <>
            <View className="flex-row items-center px-3 pb-2">
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
                      isMe ? "text-green-700 dark:text-green-400" : "text-gray-900 dark:text-white"
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
        )
      ) : allTimeStats.length === 0 ? (
        <View className="py-12 items-center">
          <Text className="text-4xl mb-3">📊</Text>
          <Text className="text-gray-500 dark:text-gray-400 text-center">
            All-time stats appear after sessions are played.
          </Text>
        </View>
      ) : (
        <>
          <View className="flex-row items-center px-3 pb-2">
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
                    isMe ? "text-green-700 dark:text-green-400" : "text-gray-900 dark:text-white"
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
    </ScrollView>
  );
}

// ─── Main Play Screen ────────────────────────────────────────────────────────

export default function PlayScreen() {
  const { player } = useAuthStore();
  const isAdmin = player?.role === "admin";

  const visibleSections = ALL_SECTIONS.filter(
    (s) => !s.adminOnly || isAdmin
  );

  const defaultSection = isAdmin ? "create-shootout" : "join-active";
  const [active, setActive] = useState<PlaySection>(defaultSection as PlaySection);

  const renderContent = () => {
    switch (active) {
      case "join-active":
        return <JoinActiveSection />;
      case "player-ranking":
        return <PlayerRankingSection />;
      case "create-shootout":
        return <ComingSoon title="Create Shootout" />;
      case "list-shootouts":
        return <ComingSoon title="List Shootouts" />;
      case "message-players":
        return <ComingSoon title="Message Players" />;
      case "reset-scores":
        return <ComingSoon title="Reset Scores" />;
      case "preferences":
        return <ComingSoon title="Preferences" />;
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <View className="px-5 pt-4 pb-2">
        <Text className="text-2xl font-bold text-gray-900 dark:text-white">Play</Text>
      </View>

      {/* Horizontal sub-nav */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 4 }}
        className="flex-grow-0"
      >
        {visibleSections.map((section) => (
          <TouchableOpacity
            key={section.key}
            onPress={() => setActive(section.key)}
            className={`mr-2 px-4 py-2 rounded-full ${
              active === section.key
                ? "bg-green-600"
                : "bg-gray-100 dark:bg-gray-800"
            }`}
          >
            <Text
              className={`text-sm font-semibold ${
                active === section.key
                  ? "text-white"
                  : "text-gray-700 dark:text-gray-300"
              }`}
            >
              {section.label}
              {section.adminOnly && active !== section.key && (
                <Text className="text-amber-500"> ★</Text>
              )}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Divider */}
      <View className="h-px bg-gray-200 dark:bg-gray-800 mx-5 mt-2" />

      {/* Section content */}
      <View className="flex-1">{renderContent()}</View>
    </SafeAreaView>
  );
}
