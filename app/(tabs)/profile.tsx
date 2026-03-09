import { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  Switch,
  useColorScheme,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useAuthStore } from "@/store/auth.store";
import { supabase } from "@/lib/supabase";
import { AllTimeStats } from "@/types/database";
import { formatWinPct } from "@/lib/utils";
import {
  registerForPushNotifications,
  savePushToken,
} from "@/lib/notifications";

export default function ProfileScreen() {
  const router = useRouter();
  const { player, signOut } = useAuthStore();
  const colorScheme = useColorScheme();
  const [stats, setStats] = useState<AllTimeStats | null>(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(!!player?.push_token);

  useEffect(() => {
    if (!player) return;
    supabase
      .from("all_time_stats")
      .select("*")
      .eq("player_id", player.id)
      .single()
      .then(({ data }) => {
        if (data) setStats(data as AllTimeStats);
      });
  }, [player?.id]);

  const handleToggleNotifications = async (value: boolean) => {
    setNotificationsEnabled(value);
    if (value && player) {
      const token = await registerForPushNotifications();
      if (token) {
        await savePushToken(player.id, token);
      } else {
        setNotificationsEnabled(false);
        Alert.alert(
          "Permission Required",
          "Please enable notifications in your device settings."
        );
      }
    } else if (player) {
      await supabase
        .from("players")
        .update({ push_token: null })
        .eq("id", player.id);
    }
  };

  const handleSignOut = () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign Out", style: "destructive", onPress: signOut },
    ]);
  };

  const isAdmin = player?.role === "admin";

  return (
    <SafeAreaView className="flex-1 bg-gray-50 dark:bg-gray-950">
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Header */}
        <View className="px-5 pt-4 pb-2">
          <Text className="text-2xl font-bold text-gray-900 dark:text-white">
            Profile
          </Text>
        </View>

        {/* Player Card */}
        <View className="mx-5 mt-3 bg-white dark:bg-gray-900 rounded-2xl p-5 border border-gray-100 dark:border-gray-800">
          <View className="flex-row items-center mb-4">
            <View className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full items-center justify-center mr-4">
              <Text className="text-2xl font-bold text-green-700 dark:text-green-400">
                {player?.full_name?.charAt(0) ?? "?"}
              </Text>
            </View>
            <View className="flex-1">
              <Text className="text-xl font-bold text-gray-900 dark:text-white">
                {player?.full_name}
              </Text>
              <Text className="text-gray-500 dark:text-gray-400 text-sm">
                {player?.email}
              </Text>
              {isAdmin && (
                <View className="bg-green-100 dark:bg-green-900/30 rounded-full px-2.5 py-0.5 self-start mt-1">
                  <Text className="text-green-700 dark:text-green-400 text-xs font-bold">
                    ADMIN
                  </Text>
                </View>
              )}
            </View>
          </View>

          {/* Stats */}
          {stats && (
            <View className="flex-row bg-gray-50 dark:bg-gray-800 rounded-xl p-3">
              <View className="flex-1 items-center">
                <Text className="text-xl font-bold text-gray-900 dark:text-white">
                  {stats.total_wins}
                </Text>
                <Text className="text-xs text-gray-500 dark:text-gray-400">Wins</Text>
              </View>
              <View className="w-px bg-gray-200 dark:bg-gray-700" />
              <View className="flex-1 items-center">
                <Text className="text-xl font-bold text-gray-900 dark:text-white">
                  {stats.total_losses}
                </Text>
                <Text className="text-xs text-gray-500 dark:text-gray-400">Losses</Text>
              </View>
              <View className="w-px bg-gray-200 dark:bg-gray-700" />
              <View className="flex-1 items-center">
                <Text className="text-xl font-bold text-gray-900 dark:text-white">
                  {formatWinPct(stats.total_wins, stats.total_losses)}
                </Text>
                <Text className="text-xs text-gray-500 dark:text-gray-400">Win%</Text>
              </View>
              <View className="w-px bg-gray-200 dark:bg-gray-700" />
              <View className="flex-1 items-center">
                <Text className="text-xl font-bold text-gray-900 dark:text-white">
                  {stats.sessions_played}
                </Text>
                <Text className="text-xs text-gray-500 dark:text-gray-400">Sessions</Text>
              </View>
            </View>
          )}
        </View>

        {/* Admin Section */}
        {isAdmin && (
          <View className="mx-5 mt-4">
            <Text className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2 px-1">
              Admin Tools
            </Text>
            <View className="bg-white dark:bg-gray-900 rounded-2xl overflow-hidden border border-gray-100 dark:border-gray-800">
              {[
                { label: "Session Manager", emoji: "📋", route: "/admin/session-manager" },
                { label: "Round Control", emoji: "🎾", route: "/admin/round-control" },
                { label: "Player Manager", emoji: "👥", route: "/admin/player-manager" },
                { label: "Announcements", emoji: "📢", route: "/admin/announcements" },
              ].map((item, index) => (
                <TouchableOpacity
                  key={item.route}
                  onPress={() => router.push(item.route as any)}
                  className={`flex-row items-center px-4 py-4 active:bg-gray-50 dark:active:bg-gray-800 ${
                    index > 0 ? "border-t border-gray-50 dark:border-gray-800" : ""
                  }`}
                >
                  <Text className="text-xl mr-3">{item.emoji}</Text>
                  <Text className="flex-1 text-gray-900 dark:text-white font-medium">
                    {item.label}
                  </Text>
                  <Text className="text-gray-400">›</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Settings */}
        <View className="mx-5 mt-4">
          <Text className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2 px-1">
            Settings
          </Text>
          <View className="bg-white dark:bg-gray-900 rounded-2xl overflow-hidden border border-gray-100 dark:border-gray-800">
            <View className="flex-row items-center px-4 py-4">
              <Text className="text-xl mr-3">🔔</Text>
              <Text className="flex-1 text-gray-900 dark:text-white font-medium">
                Push Notifications
              </Text>
              <Switch
                value={notificationsEnabled}
                onValueChange={handleToggleNotifications}
                trackColor={{ false: "#d1d5db", true: "#16a34a" }}
                thumbColor="white"
              />
            </View>
          </View>
        </View>

        {/* Sign Out */}
        <View className="mx-5 mt-4">
          <TouchableOpacity
            onPress={handleSignOut}
            className="bg-white dark:bg-gray-900 rounded-2xl py-4 items-center border border-gray-100 dark:border-gray-800"
          >
            <Text className="text-red-600 font-semibold">Sign Out</Text>
          </TouchableOpacity>
        </View>

        <Text className="text-center text-xs text-gray-400 dark:text-gray-600 mt-6">
          Athens Pickleball v1.0
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
