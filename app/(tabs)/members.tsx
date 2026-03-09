import { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
  TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuthStore } from "@/store/auth.store";
import { supabase } from "@/lib/supabase";
import { Player } from "@/types/database";

type MembersTab = "view" | "manage" | "message";

// ─── View Members ─────────────────────────────────────────────────────────────

function ViewMembersSection() {
  const { player: currentPlayer } = useAuthStore();
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadPlayers = async () => {
    const { data } = await supabase
      .from("players")
      .select("*")
      .order("full_name");
    if (data) setPlayers(data as Player[]);
    setLoading(false);
  };

  useEffect(() => { loadPlayers(); }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadPlayers();
    setRefreshing(false);
  };

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator size="large" color="#16a34a" />
      </View>
    );
  }

  return (
    <ScrollView
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      contentContainerStyle={{ paddingBottom: 32, paddingHorizontal: 20 }}
    >
      <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide mt-4 mb-3">
        {players.length} Members
      </Text>
      <View className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
        {players.map((p, index) => {
          const isMe = p.id === currentPlayer?.id;
          return (
            <View
              key={p.id}
              className={`flex-row items-center px-4 py-3.5 ${
                index > 0 ? "border-t border-gray-50 dark:border-gray-800" : ""
              } ${isMe ? "bg-green-50 dark:bg-green-900/10" : ""}`}
            >
              <View className="w-9 h-9 bg-green-100 dark:bg-green-900/30 rounded-full items-center justify-center mr-3">
                <Text className="text-green-700 dark:text-green-400 font-bold text-sm">
                  {p.full_name?.charAt(0).toUpperCase() ?? "?"}
                </Text>
              </View>
              <View className="flex-1">
                <Text className="text-gray-900 dark:text-white font-medium">
                  {p.full_name}
                  {isMe && (
                    <Text className="text-green-600 dark:text-green-400 font-normal text-sm">
                      {" "}(you)
                    </Text>
                  )}
                </Text>
                <Text className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {p.email}
                </Text>
              </View>
              {p.role === "admin" && (
                <View className="bg-amber-100 dark:bg-amber-900/30 rounded-full px-2 py-0.5 ml-2">
                  <Text className="text-amber-700 dark:text-amber-400 text-xs font-semibold">
                    Admin
                  </Text>
                </View>
              )}
              {p.skill_rating != null && (
                <Text className="text-xs text-gray-400 ml-2">
                  ★ {p.skill_rating.toFixed(1)}
                </Text>
              )}
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

// ─── Manage Members (Admin) ───────────────────────────────────────────────────

function ManageMembersSection() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);

  const loadPlayers = async () => {
    const { data } = await supabase.from("players").select("*").order("full_name");
    if (data) setPlayers(data as Player[]);
    setLoading(false);
  };

  useEffect(() => { loadPlayers(); }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadPlayers();
    setRefreshing(false);
  };

  const toggleRole = async (p: Player) => {
    const newRole = p.role === "admin" ? "player" : "admin";
    Alert.alert(
      "Change Role",
      `Make ${p.full_name} a${newRole === "admin" ? "n admin" : " player"}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Confirm",
          onPress: async () => {
            setSaving(p.id);
            const { error } = await supabase
              .from("players")
              .update({ role: newRole })
              .eq("id", p.id);
            setSaving(null);
            if (error) {
              Alert.alert("Error", error.message);
            } else {
              setPlayers((prev) =>
                prev.map((x) => (x.id === p.id ? { ...x, role: newRole } : x))
              );
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator size="large" color="#16a34a" />
      </View>
    );
  }

  return (
    <ScrollView
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      contentContainerStyle={{ paddingBottom: 32, paddingHorizontal: 20 }}
    >
      <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wide mt-4 mb-3">
        Manage Roles & Access
      </Text>
      <View className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
        {players.map((p, index) => (
          <View
            key={p.id}
            className={`flex-row items-center px-4 py-3.5 ${
              index > 0 ? "border-t border-gray-50 dark:border-gray-800" : ""
            }`}
          >
            <View className="flex-1">
              <Text className="text-gray-900 dark:text-white font-medium">{p.full_name}</Text>
              <Text className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{p.email}</Text>
            </View>
            <TouchableOpacity
              onPress={() => toggleRole(p)}
              disabled={saving === p.id}
              className={`rounded-full px-3 py-1.5 ml-3 ${
                p.role === "admin"
                  ? "bg-amber-100 dark:bg-amber-900/30"
                  : "bg-gray-100 dark:bg-gray-800"
              }`}
            >
              {saving === p.id ? (
                <ActivityIndicator size="small" color="#16a34a" />
              ) : (
                <Text
                  className={`text-xs font-semibold ${
                    p.role === "admin"
                      ? "text-amber-700 dark:text-amber-400"
                      : "text-gray-600 dark:text-gray-400"
                  }`}
                >
                  {p.role === "admin" ? "Admin" : "Player"}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

// ─── Message Members (Admin) ──────────────────────────────────────────────────

function MessageMembersSection() {
  const { player } = useAuthStore();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (!title.trim() || !body.trim()) {
      Alert.alert("Missing Fields", "Please enter a title and message.");
      return;
    }
    if (!player) return;
    setSending(true);
    const { error } = await supabase.from("announcements").insert({
      title: title.trim(),
      body: body.trim(),
      type: "general",
      sent_by: player.id,
    });
    setSending(false);
    if (error) {
      Alert.alert("Error", error.message);
    } else {
      Alert.alert("Sent!", "Announcement sent to all members.");
      setTitle("");
      setBody("");
    }
  };

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 40, paddingHorizontal: 20 }}>
      <View className="mt-4 bg-white dark:bg-gray-900 rounded-2xl p-5 border border-gray-100 dark:border-gray-800">
        <Text className="text-base font-bold text-gray-900 dark:text-white mb-4">
          Send Announcement
        </Text>

        <View className="mb-4">
          <Text className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
            Title
          </Text>
          <TextInput
            className="bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white px-4 py-3 rounded-xl text-base"
            placeholder="e.g. Schedule Change"
            placeholderTextColor="#9ca3af"
            value={title}
            onChangeText={setTitle}
          />
        </View>

        <View className="mb-4">
          <Text className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
            Message
          </Text>
          <TextInput
            className="bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white px-4 py-3 rounded-xl text-base"
            placeholder="Write your message here..."
            placeholderTextColor="#9ca3af"
            value={body}
            onChangeText={setBody}
            multiline
            numberOfLines={5}
            style={{ minHeight: 120, textAlignVertical: "top" }}
          />
        </View>

        <TouchableOpacity
          onPress={handleSend}
          disabled={sending}
          className="bg-green-600 rounded-xl py-4 items-center active:bg-green-700"
        >
          {sending ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text className="text-white font-bold text-base">Send to All Members</Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

// ─── Main Members Screen ──────────────────────────────────────────────────────

export default function MembersScreen() {
  const { player } = useAuthStore();
  const isAdmin = player?.role === "admin";
  const [activeTab, setActiveTab] = useState<MembersTab>("view");

  const tabs: { key: MembersTab; label: string; adminOnly: boolean }[] = [
    { key: "view", label: "View Members", adminOnly: false },
    { key: "manage", label: "Manage Members", adminOnly: true },
    { key: "message", label: "Message Members", adminOnly: true },
  ];

  const visibleTabs = tabs.filter((t) => !t.adminOnly || isAdmin);

  return (
    <SafeAreaView className="flex-1 bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <View className="px-5 pt-4 pb-2">
        <Text className="text-2xl font-bold text-gray-900 dark:text-white">Members</Text>
      </View>

      {/* Tab switcher */}
      <View className="flex-row mx-5 mt-2 mb-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
        {visibleTabs.map((t) => (
          <TouchableOpacity
            key={t.key}
            onPress={() => setActiveTab(t.key)}
            className={`flex-1 py-2.5 rounded-lg items-center ${
              activeTab === t.key ? "bg-white dark:bg-gray-700 shadow-sm" : ""
            }`}
          >
            <Text
              className={`font-semibold text-sm ${
                activeTab === t.key
                  ? "text-gray-900 dark:text-white"
                  : "text-gray-500 dark:text-gray-400"
              }`}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View className="flex-1">
        {activeTab === "view" && <ViewMembersSection />}
        {activeTab === "manage" && isAdmin && <ManageMembersSection />}
        {activeTab === "message" && isAdmin && <MessageMembersSection />}
      </View>
    </SafeAreaView>
  );
}
