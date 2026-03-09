import { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuthStore } from "@/store/auth.store";
import { useSessionStore } from "@/store/session.store";
import { Session } from "@/types/database";
import { formatDate, formatTime, getCountdown } from "@/lib/utils";

export default function HomeScreen() {
  const { player } = useAuthStore();
  const {
    upcomingSession,
    mySignUps,
    signUps,
    loading,
    fetchSessions,
    fetchSignUps,
    fetchMySignUps,
    signUpForSession,
    withdrawFromSession,
  } = useSessionStore();

  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [countdown, setCountdown] = useState("");

  const mySignUp = mySignUps.find((s) => s.session_id === upcomingSession?.id);
  const confirmedCount = signUps.filter((s) => s.status === "confirmed").length;
  const waitlistCount = signUps.filter((s) => s.status === "waitlist").length;

  const loadData = async () => {
    await fetchSessions();
    if (player) await fetchMySignUps(player.id);
  };

  const loadSignUps = async (session: Session) => {
    await fetchSignUps(session.id);
  };

  useEffect(() => {
    loadData();
  }, [player]);

  useEffect(() => {
    if (upcomingSession) loadSignUps(upcomingSession);
  }, [upcomingSession?.id]);

  // Countdown timer
  useEffect(() => {
    if (!upcomingSession) return;
    const update = () => setCountdown(getCountdown(upcomingSession.start_time));
    update();
    const interval = setInterval(update, 60000);
    return () => clearInterval(interval);
  }, [upcomingSession?.start_time]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleSignUp = async () => {
    if (!player || !upcomingSession) return;
    setActionLoading(true);
    const { error } = await signUpForSession(upcomingSession.id, player.id);
    setActionLoading(false);
    if (error) {
      Alert.alert("Sign-up Failed", error);
    } else {
      await loadSignUps(upcomingSession);
    }
  };

  const handleWithdraw = async () => {
    if (!player || !upcomingSession) return;
    Alert.alert(
      "Withdraw",
      "Are you sure you want to withdraw from this session?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Withdraw",
          style: "destructive",
          onPress: async () => {
            setActionLoading(true);
            const { error } = await withdrawFromSession(upcomingSession.id, player.id);
            setActionLoading(false);
            if (error) Alert.alert("Error", error);
            else await loadSignUps(upcomingSession);
          },
        },
      ]
    );
  };

  const isSignedUp = !!mySignUp && mySignUp.status !== "withdrawn";
  const isWaitlisted = mySignUp?.status === "waitlist";
  const isCutoffPassed = upcomingSession
    ? new Date() > new Date(upcomingSession.cutoff_time)
    : false;

  return (
    <SafeAreaView className="flex-1 bg-gray-50 dark:bg-gray-950">
      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        contentContainerStyle={{ paddingBottom: 32 }}
      >
        {/* Header */}
        <View className="px-5 pt-4 pb-2">
          <Text className="text-2xl font-bold text-gray-900 dark:text-white">
            Hey, {player?.full_name?.split(" ")[0]} 👋
          </Text>
          <Text className="text-gray-500 dark:text-gray-400 mt-0.5">
            Athens Pickleball — Weekly Shootout
          </Text>
        </View>

        {loading && !upcomingSession ? (
          <View className="flex-1 items-center justify-center py-20">
            <ActivityIndicator size="large" color="#16a34a" />
          </View>
        ) : upcomingSession ? (
          <>
            {/* Countdown Banner */}
            {countdown && (
              <View className="mx-5 mt-4 bg-green-600 rounded-2xl px-5 py-4 flex-row items-center">
                <Text className="text-3xl mr-3">⏰</Text>
                <View>
                  <Text className="text-white text-xs font-medium opacity-80">
                    NEXT SESSION IN
                  </Text>
                  <Text className="text-white text-lg font-bold">{countdown}</Text>
                </View>
              </View>
            )}

            {/* Session Card */}
            <View className="mx-5 mt-4 bg-white dark:bg-gray-900 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-800">
              <View className="flex-row justify-between items-start mb-4">
                <View>
                  <Text className="text-xs font-semibold text-green-600 uppercase tracking-wide">
                    Upcoming Session
                  </Text>
                  <Text className="text-xl font-bold text-gray-900 dark:text-white mt-1">
                    {formatDate(upcomingSession.date)}
                  </Text>
                </View>
                <View className="bg-green-50 dark:bg-green-900/30 px-3 py-1 rounded-full">
                  <Text className="text-green-700 dark:text-green-400 text-xs font-semibold">
                    {upcomingSession.status.toUpperCase()}
                  </Text>
                </View>
              </View>

              {/* Session Details */}
              <View className="space-y-2.5 mb-4">
                <View className="flex-row items-center">
                  <Text className="text-base mr-2">📍</Text>
                  <Text className="text-gray-700 dark:text-gray-300">
                    {upcomingSession.location}
                  </Text>
                </View>
                <View className="flex-row items-center">
                  <Text className="text-base mr-2">🕐</Text>
                  <Text className="text-gray-700 dark:text-gray-300">
                    {formatTime(upcomingSession.start_time)}
                  </Text>
                </View>
                <View className="flex-row items-center">
                  <Text className="text-base mr-2">🎾</Text>
                  <Text className="text-gray-700 dark:text-gray-300">
                    {upcomingSession.num_courts} courts
                  </Text>
                </View>
              </View>

              {/* Player Count */}
              <View className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3 mb-4">
                <View className="flex-row justify-between">
                  <View className="items-center flex-1">
                    <Text className="text-xl font-bold text-gray-900 dark:text-white">
                      {confirmedCount}
                    </Text>
                    <Text className="text-xs text-gray-500 dark:text-gray-400">
                      Confirmed
                    </Text>
                  </View>
                  <View className="w-px bg-gray-200 dark:bg-gray-700" />
                  <View className="items-center flex-1">
                    <Text className="text-xl font-bold text-gray-900 dark:text-white">
                      {upcomingSession.max_players}
                    </Text>
                    <Text className="text-xs text-gray-500 dark:text-gray-400">
                      Max Players
                    </Text>
                  </View>
                  <View className="w-px bg-gray-200 dark:bg-gray-700" />
                  <View className="items-center flex-1">
                    <Text className="text-xl font-bold text-orange-500">
                      {waitlistCount}
                    </Text>
                    <Text className="text-xs text-gray-500 dark:text-gray-400">
                      Waitlist
                    </Text>
                  </View>
                </View>
              </View>

              {/* My Status Badge */}
              {isSignedUp && (
                <View
                  className={`rounded-xl px-4 py-3 mb-3 ${
                    isWaitlisted
                      ? "bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800"
                      : "bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800"
                  }`}
                >
                  <Text
                    className={`font-semibold text-center ${
                      isWaitlisted
                        ? "text-orange-700 dark:text-orange-400"
                        : "text-green-700 dark:text-green-400"
                    }`}
                  >
                    {isWaitlisted
                      ? `You're on the waitlist (#${mySignUp?.waitlist_position})`
                      : "You're in! ✓"}
                  </Text>
                </View>
              )}

              {/* Action Button */}
              {!isCutoffPassed ? (
                isSignedUp ? (
                  <TouchableOpacity
                    onPress={handleWithdraw}
                    disabled={actionLoading}
                    className="border border-red-300 dark:border-red-700 rounded-xl py-3.5 items-center active:opacity-70"
                  >
                    {actionLoading ? (
                      <ActivityIndicator color="#ef4444" />
                    ) : (
                      <Text className="text-red-600 dark:text-red-400 font-semibold">
                        Withdraw
                      </Text>
                    )}
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    onPress={handleSignUp}
                    disabled={actionLoading}
                    className="bg-green-600 rounded-xl py-4 items-center active:bg-green-700"
                  >
                    {actionLoading ? (
                      <ActivityIndicator color="white" />
                    ) : (
                      <Text className="text-white font-bold text-base">
                        {confirmedCount >= upcomingSession.max_players
                          ? "Join Waitlist"
                          : "Sign Up"}
                      </Text>
                    )}
                  </TouchableOpacity>
                )
              ) : (
                <View className="bg-gray-100 dark:bg-gray-800 rounded-xl py-3.5 items-center">
                  <Text className="text-gray-500 dark:text-gray-400 font-medium">
                    Sign-up closed
                  </Text>
                </View>
              )}
            </View>

            {/* Signed Up Players */}
            {signUps.filter((s) => s.status === "confirmed").length > 0 && (
              <View className="mx-5 mt-4">
                <Text className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  Players ({confirmedCount}/{upcomingSession.max_players})
                </Text>
                <View className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden">
                  {signUps
                    .filter((s) => s.status === "confirmed")
                    .slice(0, 8)
                    .map((signup, index) => (
                      <View
                        key={signup.id}
                        className={`flex-row items-center px-4 py-3 ${
                          index > 0 ? "border-t border-gray-50 dark:border-gray-800" : ""
                        }`}
                      >
                        <View className="w-7 h-7 bg-green-100 dark:bg-green-900/30 rounded-full items-center justify-center mr-3">
                          <Text className="text-green-700 dark:text-green-400 text-xs font-bold">
                            {index + 1}
                          </Text>
                        </View>
                        <Text className="text-gray-900 dark:text-white flex-1">
                          {signup.player?.full_name ?? "Unknown"}
                        </Text>
                        {signup.player_id === player?.id && (
                          <Text className="text-xs text-green-600 dark:text-green-400 font-medium">
                            You
                          </Text>
                        )}
                      </View>
                    ))}
                  {confirmedCount > 8 && (
                    <View className="px-4 py-3 border-t border-gray-50 dark:border-gray-800">
                      <Text className="text-gray-500 dark:text-gray-400 text-sm">
                        +{confirmedCount - 8} more players
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            )}
          </>
        ) : (
          <View className="mx-5 mt-8 items-center py-12">
            <Text className="text-5xl mb-4">🏓</Text>
            <Text className="text-lg font-semibold text-gray-900 dark:text-white">
              No upcoming sessions
            </Text>
            <Text className="text-gray-500 dark:text-gray-400 text-center mt-2">
              Check back soon for the next session.
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
