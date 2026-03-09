import { useEffect, useState } from "react";
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
import { Match } from "@/types/database";
import { courtLabel } from "@/lib/utils";

export default function LiveScreen() {
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

  // Realtime subscription for score updates
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

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const myMatch = matches.find(
    (m) =>
      m.team1_player_ids.includes(player?.id ?? "") ||
      m.team2_player_ids.includes(player?.id ?? "")
  );

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

  const getPlayerNames = (ids: string[]): string => {
    return ids
      .map((id) => {
        const state = playerStates.find((ps) => ps.player_id === id);
        return state?.player?.full_name?.split(" ")[0] ?? "?";
      })
      .join(" & ");
  };

  if (!activeSession) {
    return (
      <SafeAreaView className="flex-1 bg-gray-50 dark:bg-gray-950 items-center justify-center">
        <Text className="text-4xl mb-4">😴</Text>
        <Text className="text-lg font-semibold text-gray-900 dark:text-white">
          No active session
        </Text>
        <Text className="text-gray-500 dark:text-gray-400 text-center mt-2 px-8">
          Live court data will appear here once a session is started by the admin.
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-gray-50 dark:bg-gray-950">
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={{ paddingBottom: 32 }}
      >
        {/* Header */}
        <View className="px-5 pt-4 pb-2 flex-row items-center justify-between">
          <View>
            <Text className="text-2xl font-bold text-gray-900 dark:text-white">
              Live 🎾
            </Text>
            {currentRound && (
              <Text className="text-green-600 dark:text-green-400 font-medium">
                Round {currentRound.round_number} in progress
              </Text>
            )}
          </View>
          <View className="bg-red-500 rounded-full px-3 py-1">
            <Text className="text-white text-xs font-bold">LIVE</Text>
          </View>
        </View>

        {/* My Match highlight */}
        {myMatch && (
          <View className="mx-5 mt-4 bg-green-600 rounded-2xl p-4">
            <Text className="text-green-100 text-xs font-semibold mb-2">YOUR MATCH</Text>
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
        <View className="px-5 mt-4">
          <Text className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
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
        </View>
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
    </SafeAreaView>
  );
}
