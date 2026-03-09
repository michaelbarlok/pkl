import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuthStore } from "@/store/auth.store";

function MenuItem({
  emoji,
  title,
  description,
  onPress,
  adminOnly,
}: {
  emoji: string;
  title: string;
  description: string;
  onPress: () => void;
  adminOnly?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      className="bg-white dark:bg-gray-900 rounded-2xl px-4 py-4 mb-3 flex-row items-center border border-gray-100 dark:border-gray-800 active:opacity-70"
    >
      <Text style={{ fontSize: 24 }} className="mr-4">
        {emoji}
      </Text>
      <View className="flex-1">
        <View className="flex-row items-center gap-2">
          <Text className="text-base font-semibold text-gray-900 dark:text-white">
            {title}
          </Text>
          {adminOnly && (
            <View className="bg-amber-100 dark:bg-amber-900/30 rounded-full px-2 py-0.5">
              <Text className="text-amber-700 dark:text-amber-400 text-xs font-semibold">
                Admin
              </Text>
            </View>
          )}
        </View>
        <Text className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          {description}
        </Text>
      </View>
      <Text className="text-gray-400 text-lg ml-2">›</Text>
    </TouchableOpacity>
  );
}

export default function ClubScreen() {
  const { player } = useAuthStore();
  const isAdmin = player?.role === "admin";

  return (
    <SafeAreaView className="flex-1 bg-gray-50 dark:bg-gray-950">
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        {/* Header */}
        <View className="px-5 pt-4 pb-2">
          <Text className="text-2xl font-bold text-gray-900 dark:text-white">
            Club
          </Text>
          <Text className="text-gray-500 dark:text-gray-400 mt-0.5">
            Athens Pickleball
          </Text>
        </View>

        {isAdmin ? (
          <View className="px-5 mt-4">
            <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
              Administration
            </Text>
            <MenuItem
              emoji="⚙️"
              title="Edit Club"
              description="Update club settings, location, and rules"
              adminOnly
              onPress={() => {}}
            />
          </View>
        ) : (
          <View className="mx-5 mt-8 bg-white dark:bg-gray-900 rounded-2xl p-6 border border-gray-100 dark:border-gray-800 items-center">
            <Text className="text-5xl mb-4">🏟️</Text>
            <Text className="text-lg font-bold text-gray-900 dark:text-white">
              Athens Pickleball Club
            </Text>
            <Text className="text-gray-500 dark:text-gray-400 text-center mt-2">
              Weekly Shootout League
            </Text>
            <View className="w-full mt-6 border-t border-gray-100 dark:border-gray-800 pt-4 space-y-2">
              <View className="flex-row items-center">
                <Text className="text-base mr-2">📍</Text>
                <Text className="text-gray-700 dark:text-gray-300">
                  Athens, GA
                </Text>
              </View>
              <View className="flex-row items-center">
                <Text className="text-base mr-2">📅</Text>
                <Text className="text-gray-700 dark:text-gray-300">
                  Weekly shootout format
                </Text>
              </View>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
