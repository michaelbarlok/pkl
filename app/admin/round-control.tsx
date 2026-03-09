import { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "@/lib/supabase";
import { useSessionStore } from "@/store/session.store";
import { useAuthStore } from "@/store/auth.store";
import { Court, Round, Match, PlayerSessionState } from "@/types/database";
import {
  seedPlayersToCourts,
  assignPartnersForRound,
  applyRoundResults,
  updatePairings,
} from "@/lib/shootout-engine";

export default function RoundControlScreen() {
  const { player } = useAuthStore();
  const { activeSession, fetchSessions, fetchPlayerStates, playerStates, fetchCurrentRound, currentRound, fetchMatches, matches } =
    useSessionStore();
  const [loading, setLoading] = useState(false);
  const [courts, setCourts] = useState<Court[]>([]);

  useEffect(() => {
    fetchSessions();
  }, []);

  useEffect(() => {
    if (activeSession) {
      fetchPlayerStates(activeSession.id);
      fetchCurrentRound(activeSession.id);
      loadCourts();
    }
  }, [activeSession?.id]);

  useEffect(() => {
    if (currentRound) fetchMatches(currentRound.id);
  }, [currentRound?.id]);

  const loadCourts = async () => {
    if (!activeSession) return;
    const { data } = await supabase
      .from("courts")
      .select("*")
      .eq("session_id", activeSession.id)
      .order("court_number");
    if (data) setCourts(data as Court[]);
  };

  const generateRound1 = async () => {
    if (!activeSession || !player) return;

    Alert.alert(
      "Generate Round 1",
      "This will seed all confirmed players onto courts. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Generate",
          onPress: async () => {
            setLoading(true);
            try {
              // Get confirmed players
              const { data: signUps } = await supabase
                .from("sign_ups")
                .select("player_id, player:players(id, skill_rating)")
                .eq("session_id", activeSession.id)
                .eq("status", "confirmed");

              if (!signUps?.length) {
                Alert.alert("No players", "No confirmed players to seed.");
                setLoading(false);
                return;
              }

              const players = signUps.map((s: any) => s.player);
              const numCourts = activeSession.num_courts;

              // Create courts if they don't exist
              const courtInserts = Array.from({ length: numCourts }, (_, i) => ({
                session_id: activeSession.id,
                court_number: i + 1,
                label: i === 0 ? "Court 1 (Top)" : `Court ${i + 1}`,
              }));

              const { data: newCourts } = await supabase
                .from("courts")
                .upsert(courtInserts, { onConflict: "session_id,court_number" })
                .select();

              setCourts((newCourts as Court[]) ?? []);

              // Seed players
              const positions = seedPlayersToCourts(players, numCourts);

              // Create player session states
              const stateInserts = positions.map((pos) => ({
                session_id: activeSession.id,
                player_id: pos.playerId,
                current_court: pos.courtNumber,
                wins: 0,
                losses: 0,
                peak_court: pos.courtNumber,
              }));

              await supabase
                .from("player_session_states")
                .upsert(stateInserts, { onConflict: "session_id,player_id" });

              // Create round 1
              const { data: round } = await supabase
                .from("rounds")
                .insert({
                  session_id: activeSession.id,
                  round_number: 1,
                  started_at: new Date().toISOString(),
                })
                .select()
                .single();

              if (!round) throw new Error("Failed to create round");

              // Assign partners and create matches
              const allCourts = (newCourts as Court[]) ?? courts;
              const pairings = new Map<string, Set<string>>();
              const assignments = assignPartnersForRound(positions, pairings, numCourts);

              const matchInserts = assignments.map((assignment) => {
                const court = allCourts.find(
                  (c) => c.court_number === assignment.courtNumber
                );
                return {
                  round_id: round.id,
                  court_id: court!.id,
                  team1_player_ids: assignment.team1,
                  team2_player_ids: assignment.team2,
                };
              });

              await supabase.from("matches").insert(matchInserts);

              await fetchPlayerStates(activeSession.id);
              await fetchCurrentRound(activeSession.id);
            } catch (err: any) {
              Alert.alert("Error", err.message);
            }
            setLoading(false);
          },
        },
      ]
    );
  };

  const startNextRound = async () => {
    if (!activeSession || !currentRound) return;

    const unscored = matches.filter(
      (m) => m.team1_score == null || m.team2_score == null
    );
    if (unscored.length > 0) {
      Alert.alert(
        "Incomplete Scores",
        `${unscored.length} match(es) still need scores. Continue anyway?`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Continue", onPress: () => doStartNextRound() },
        ]
      );
    } else {
      doStartNextRound();
    }
  };

  const doStartNextRound = async () => {
    if (!activeSession || !currentRound) return;
    setLoading(true);

    try {
      // Complete current round
      await supabase
        .from("rounds")
        .update({ completed_at: new Date().toISOString() })
        .eq("id", currentRound.id);

      // Apply results to player positions
      const results = matches
        .filter((m) => m.team1_score != null && m.team2_score != null)
        .map((m) => ({
          team1PlayerIds: m.team1_player_ids,
          team2PlayerIds: m.team2_player_ids,
          team1Won: (m.team1_score ?? 0) > (m.team2_score ?? 0),
        }));

      const currentPositions = playerStates.map((ps) => ({
        playerId: ps.player_id,
        courtNumber: ps.current_court,
      }));

      const newPositions = applyRoundResults(
        currentPositions,
        results,
        activeSession.num_courts
      );

      // Update wins/losses and positions
      for (const match of matches) {
        if (match.team1_score == null || match.team2_score == null) continue;
        const team1Won = match.team1_score > match.team2_score;
        const winners = team1Won ? match.team1_player_ids : match.team2_player_ids;
        const losers = team1Won ? match.team2_player_ids : match.team1_player_ids;

        for (const pid of winners) {
          await supabase.rpc("increment_player_stat", {
            p_session_id: activeSession.id,
            p_player_id: pid,
            p_field: "wins",
          }).catch(() => {
            supabase
              .from("player_session_states")
              .update({ wins: supabase.rpc as any })
              .eq("session_id", activeSession.id)
              .eq("player_id", pid);
          });
        }
        for (const pid of losers) {
          supabase
            .from("player_session_states")
            .select("wins, losses")
            .eq("session_id", activeSession.id)
            .eq("player_id", pid)
            .single()
            .then(({ data }) => {
              if (data) {
                supabase
                  .from("player_session_states")
                  .update({ losses: (data as any).losses + 1 })
                  .eq("session_id", activeSession.id)
                  .eq("player_id", pid);
              }
            });
        }
      }

      // Update court positions
      for (const pos of newPositions) {
        const currentState = playerStates.find((ps) => ps.player_id === pos.playerId);
        await supabase
          .from("player_session_states")
          .update({
            current_court: pos.courtNumber,
            peak_court: Math.min(
              pos.courtNumber,
              currentState?.peak_court ?? pos.courtNumber
            ),
          })
          .eq("session_id", activeSession.id)
          .eq("player_id", pos.playerId);
      }

      // Build previous pairings map
      const { data: allMatches } = await supabase
        .from("matches")
        .select("team1_player_ids, team2_player_ids, round:rounds!inner(session_id)")
        .eq("round.session_id", activeSession.id);

      let pairings = new Map<string, Set<string>>();
      if (allMatches) {
        const fakeAssignments = allMatches.map((m: any) => ({
          courtNumber: 0,
          team1: m.team1_player_ids,
          team2: m.team2_player_ids,
        }));
        pairings = updatePairings(pairings, fakeAssignments);
      }

      // Create next round
      const { data: newRound } = await supabase
        .from("rounds")
        .insert({
          session_id: activeSession.id,
          round_number: currentRound.round_number + 1,
          started_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (!newRound) throw new Error("Failed to create round");

      // Assign partners for new round
      const assignments = assignPartnersForRound(
        newPositions,
        pairings,
        activeSession.num_courts
      );

      const matchInserts = assignments.map((assignment) => {
        const court = courts.find((c) => c.court_number === assignment.courtNumber);
        return {
          round_id: (newRound as Round).id,
          court_id: court!.id,
          team1_player_ids: assignment.team1,
          team2_player_ids: assignment.team2,
        };
      });

      await supabase.from("matches").insert(matchInserts);
      await fetchPlayerStates(activeSession.id);
      await fetchCurrentRound(activeSession.id);
    } catch (err: any) {
      Alert.alert("Error", err.message);
    }

    setLoading(false);
  };

  if (!activeSession) {
    return (
      <SafeAreaView
        className="flex-1 bg-gray-50 dark:bg-gray-950 items-center justify-center"
        edges={["bottom"]}
      >
        <Text className="text-4xl mb-3">⚙️</Text>
        <Text className="text-gray-500 dark:text-gray-400 text-center px-8">
          Set a session to "active" in Session Manager first.
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-gray-50 dark:bg-gray-950" edges={["bottom"]}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        {/* Session Info */}
        <View className="bg-white dark:bg-gray-900 rounded-xl p-4 mb-4 border border-gray-100 dark:border-gray-800">
          <Text className="font-bold text-gray-900 dark:text-white">
            Active Session
          </Text>
          <Text className="text-gray-500 dark:text-gray-400 text-sm mt-1">
            {activeSession.location} · {activeSession.num_courts} courts ·{" "}
            {playerStates.length} players
          </Text>
        </View>

        {/* Round Info */}
        {currentRound ? (
          <View className="bg-green-50 dark:bg-green-900/20 rounded-xl p-4 mb-4 border border-green-200 dark:border-green-800">
            <Text className="font-bold text-green-700 dark:text-green-400">
              Round {currentRound.round_number} — In Progress
            </Text>
            <Text className="text-green-600 dark:text-green-500 text-sm mt-1">
              {matches.filter((m) => m.team1_score != null).length}/{matches.length}{" "}
              scores entered
            </Text>
          </View>
        ) : (
          <View className="bg-gray-100 dark:bg-gray-800 rounded-xl p-4 mb-4">
            <Text className="text-gray-500 dark:text-gray-400 text-center">
              No round in progress
            </Text>
          </View>
        )}

        {/* Action Buttons */}
        {!currentRound ? (
          <TouchableOpacity
            onPress={generateRound1}
            disabled={loading}
            className="bg-green-600 rounded-xl py-4 items-center mb-3"
          >
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text className="text-white font-bold text-base">
                Generate Round 1
              </Text>
            )}
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={startNextRound}
            disabled={loading}
            className="bg-green-600 rounded-xl py-4 items-center mb-3"
          >
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text className="text-white font-bold text-base">
                Start Round {currentRound.round_number + 1}
              </Text>
            )}
          </TouchableOpacity>
        )}

        {/* Current Matches */}
        {matches.length > 0 && (
          <View className="mt-2">
            <Text className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
              Current Matches
            </Text>
            {matches.map((match) => (
              <View
                key={match.id}
                className="bg-white dark:bg-gray-900 rounded-xl p-3.5 mb-2 border border-gray-100 dark:border-gray-800"
              >
                <Text className="text-xs font-semibold text-green-600 mb-1.5">
                  Court {match.court?.court_number}
                </Text>
                <View className="flex-row items-center justify-between">
                  <Text className="text-gray-900 dark:text-white text-sm flex-1">
                    {match.team1_player_ids.join(", ")}
                  </Text>
                  <Text
                    className={`mx-2 font-bold ${
                      match.team1_score != null
                        ? "text-gray-900 dark:text-white"
                        : "text-gray-400"
                    }`}
                  >
                    {match.team1_score ?? "–"} : {match.team2_score ?? "–"}
                  </Text>
                  <Text className="text-gray-900 dark:text-white text-sm flex-1 text-right">
                    {match.team2_player_ids.join(", ")}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
