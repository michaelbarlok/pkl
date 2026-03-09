import { useEffect } from "react";
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "@/lib/supabase";
import { useAnnouncementsStore } from "@/store/announcements.store";
import { Announcement, AnnouncementType } from "@/types/database";
import { formatShortDate, formatTime } from "@/lib/utils";

const TYPE_CONFIG: Record<
  AnnouncementType,
  { emoji: string; color: string; label: string }
> = {
  general: { emoji: "📢", color: "bg-blue-50 dark:bg-blue-900/20", label: "General" },
  schedule_change: {
    emoji: "📅",
    color: "bg-yellow-50 dark:bg-yellow-900/20",
    label: "Schedule Change",
  },
  session_reminder: {
    emoji: "⏰",
    color: "bg-green-50 dark:bg-green-900/20",
    label: "Reminder",
  },
  weather_cancellation: {
    emoji: "🌧️",
    color: "bg-red-50 dark:bg-red-900/20",
    label: "Cancellation",
  },
};

function AnnouncementCard({ item }: { item: Announcement }) {
  const config = TYPE_CONFIG[item.type];
  return (
    <View
      className={`${config.color} rounded-2xl p-4 mb-3 border border-gray-100 dark:border-gray-800`}
    >
      <View className="flex-row items-start">
        <Text className="text-2xl mr-3">{config.emoji}</Text>
        <View className="flex-1">
          <View className="flex-row items-center justify-between mb-1">
            <Text className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">
              {config.label}
            </Text>
            <Text className="text-xs text-gray-400 dark:text-gray-500">
              {formatShortDate(item.sent_at)} · {formatTime(item.sent_at)}
            </Text>
          </View>
          <Text className="text-base font-bold text-gray-900 dark:text-white mb-1">
            {item.title}
          </Text>
          <Text className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed">
            {item.body}
          </Text>
        </View>
      </View>
    </View>
  );
}

export default function InboxScreen() {
  const { announcements, loading, fetchAnnouncements, markAllRead } =
    useAnnouncementsStore();

  useEffect(() => {
    fetchAnnouncements();
    markAllRead();

    // Realtime subscription
    const sub = supabase
      .channel("announcements")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "announcements" },
        fetchAnnouncements
      )
      .subscribe();

    return () => { sub.unsubscribe(); };
  }, []);

  return (
    <SafeAreaView className="flex-1 bg-gray-50 dark:bg-gray-950">
      <View className="px-5 pt-4 pb-2">
        <Text className="text-2xl font-bold text-gray-900 dark:text-white">
          Inbox 📬
        </Text>
        <Text className="text-gray-500 dark:text-gray-400 mt-0.5">
          League announcements
        </Text>
      </View>

      {loading && announcements.length === 0 ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#16a34a" />
        </View>
      ) : (
        <FlatList
          data={announcements}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <AnnouncementCard item={item} />}
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingTop: 8,
            paddingBottom: 32,
          }}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={fetchAnnouncements}
            />
          }
          ListEmptyComponent={
            <View className="py-16 items-center">
              <Text className="text-4xl mb-3">📭</Text>
              <Text className="text-gray-500 dark:text-gray-400 text-center">
                No announcements yet
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}
