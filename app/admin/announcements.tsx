import { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/auth.store";
import { useSessionStore } from "@/store/session.store";
import { AnnouncementType } from "@/types/database";

const ANNOUNCEMENT_TYPES: { value: AnnouncementType; label: string; emoji: string }[] = [
  { value: "general", label: "General", emoji: "📢" },
  { value: "schedule_change", label: "Schedule Change", emoji: "📅" },
  { value: "session_reminder", label: "Session Reminder", emoji: "⏰" },
  { value: "weather_cancellation", label: "Weather Cancellation", emoji: "🌧️" },
];

export default function AnnouncementsScreen() {
  const { player } = useAuthStore();
  const { upcomingSession, activeSession } = useSessionStore();
  const [type, setType] = useState<AnnouncementType>("general");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [targetSession, setTargetSession] = useState<boolean>(false);
  const [sending, setSending] = useState(false);

  const currentSession = activeSession ?? upcomingSession;

  const sendAnnouncement = async () => {
    if (!player) return;
    if (!title.trim() || !body.trim()) {
      Alert.alert("Error", "Please enter a title and message.");
      return;
    }

    Alert.alert(
      "Send Announcement",
      `Send to ${targetSession && currentSession ? "session players" : "all league members"}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Send",
          onPress: async () => {
            setSending(true);

            const { error } = await supabase.from("announcements").insert({
              league_id: "default",
              session_id: targetSession && currentSession ? currentSession.id : null,
              type,
              title: title.trim(),
              body: body.trim(),
              sent_by: player.id,
            });

            if (error) {
              Alert.alert("Error", error.message);
            } else {
              // Trigger Edge Function for push notifications
              await supabase.functions.invoke("send-announcement", {
                body: {
                  title: title.trim(),
                  body: body.trim(),
                  sessionId: targetSession && currentSession ? currentSession.id : null,
                },
              });

              setTitle("");
              setBody("");
              Alert.alert("Sent!", "Announcement sent successfully.");
            }
            setSending(false);
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-gray-50 dark:bg-gray-950" edges={["bottom"]}>
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Type selector */}
        <Text className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
          Announcement Type
        </Text>
        <View className="flex-row flex-wrap gap-2 mb-4">
          {ANNOUNCEMENT_TYPES.map((t) => (
            <TouchableOpacity
              key={t.value}
              onPress={() => setType(t.value)}
              className={`flex-row items-center px-3 py-2 rounded-xl border ${
                type === t.value
                  ? "bg-green-600 border-green-600"
                  : "bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700"
              }`}
            >
              <Text className="mr-1.5">{t.emoji}</Text>
              <Text
                className={`text-sm font-medium ${
                  type === t.value
                    ? "text-white"
                    : "text-gray-700 dark:text-gray-300"
                }`}
              >
                {t.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Title */}
        <Text className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
          Title
        </Text>
        <TextInput
          className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white px-4 py-3 rounded-xl mb-4"
          placeholder="Announcement title..."
          placeholderTextColor="#9ca3af"
          value={title}
          onChangeText={setTitle}
          returnKeyType="next"
        />

        {/* Body */}
        <Text className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
          Message
        </Text>
        <TextInput
          className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white px-4 py-3 rounded-xl mb-4"
          placeholder="Write your message here..."
          placeholderTextColor="#9ca3af"
          value={body}
          onChangeText={setBody}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
          style={{ minHeight: 100 }}
        />

        {/* Target */}
        {currentSession && (
          <View className="mb-4">
            <Text className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
              Send to
            </Text>
            <View className="flex-row space-x-2">
              {[
                { label: "All League Members", value: false },
                { label: "Session Players Only", value: true },
              ].map((option) => (
                <TouchableOpacity
                  key={String(option.value)}
                  onPress={() => setTargetSession(option.value)}
                  className={`flex-1 py-2.5 rounded-xl items-center border ${
                    targetSession === option.value
                      ? "bg-green-600 border-green-600"
                      : "bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700"
                  }`}
                >
                  <Text
                    className={`text-xs font-medium text-center ${
                      targetSession === option.value
                        ? "text-white"
                        : "text-gray-700 dark:text-gray-300"
                    }`}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Preview */}
        {title || body ? (
          <View className="bg-white dark:bg-gray-900 rounded-xl p-4 mb-4 border border-gray-200 dark:border-gray-700">
            <Text className="text-xs font-semibold text-gray-400 uppercase mb-2">
              Preview
            </Text>
            <Text className="font-bold text-gray-900 dark:text-white">{title}</Text>
            <Text className="text-gray-700 dark:text-gray-300 mt-1 text-sm">{body}</Text>
          </View>
        ) : null}

        {/* Send Button */}
        <TouchableOpacity
          onPress={sendAnnouncement}
          disabled={sending}
          className="bg-green-600 rounded-xl py-4 items-center"
        >
          {sending ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text className="text-white font-bold text-base">
              Send Announcement
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
