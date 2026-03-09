import { useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "@/lib/supabase";
import { Player } from "@/types/database";

export default function PlayerManagerScreen() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRating, setEditRating] = useState("");
  const [editRole, setEditRole] = useState<"player" | "admin">("player");

  const fetchPlayers = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("players")
      .select("*")
      .order("full_name");
    if (data) setPlayers(data as Player[]);
    setLoading(false);
  };

  useEffect(() => { fetchPlayers(); }, []);

  const filtered = players.filter((p) =>
    p.full_name.toLowerCase().includes(search.toLowerCase()) ||
    p.email.toLowerCase().includes(search.toLowerCase())
  );

  const startEdit = (player: Player) => {
    setEditingId(player.id);
    setEditRating(player.skill_rating?.toString() ?? "");
    setEditRole(player.role as "player" | "admin");
  };

  const saveEdit = async (playerId: string) => {
    const rating = parseFloat(editRating);
    const { error } = await supabase
      .from("players")
      .update({
        skill_rating: isNaN(rating) ? null : rating,
        role: editRole,
      })
      .eq("id", playerId);

    if (error) Alert.alert("Error", error.message);
    else {
      setEditingId(null);
      fetchPlayers();
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-gray-50 dark:bg-gray-950" edges={["bottom"]}>
      <View className="px-5 pt-4 pb-2">
        <TextInput
          className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white px-4 py-3 rounded-xl"
          placeholder="Search players..."
          placeholderTextColor="#9ca3af"
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#16a34a" />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 20, paddingTop: 8, paddingBottom: 40 }}
          renderItem={({ item }) => (
            <View className="bg-white dark:bg-gray-900 rounded-xl p-4 mb-2 border border-gray-100 dark:border-gray-800">
              <View className="flex-row items-center justify-between">
                <View className="flex-1">
                  <Text className="font-bold text-gray-900 dark:text-white">
                    {item.full_name}
                  </Text>
                  <Text className="text-gray-500 dark:text-gray-400 text-xs mt-0.5">
                    {item.email}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() =>
                    editingId === item.id ? saveEdit(item.id) : startEdit(item)
                  }
                  className={`px-3 py-1.5 rounded-lg ${
                    editingId === item.id ? "bg-green-600" : "bg-gray-100 dark:bg-gray-800"
                  }`}
                >
                  <Text
                    className={`text-xs font-medium ${
                      editingId === item.id
                        ? "text-white"
                        : "text-gray-700 dark:text-gray-300"
                    }`}
                  >
                    {editingId === item.id ? "Save" : "Edit"}
                  </Text>
                </TouchableOpacity>
              </View>

              {editingId === item.id ? (
                <View className="mt-3 space-y-2">
                  <View>
                    <Text className="text-xs text-gray-500 mb-1">Skill Rating (0–10)</Text>
                    <TextInput
                      className="bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white px-3 py-2 rounded-lg text-sm"
                      value={editRating}
                      onChangeText={setEditRating}
                      keyboardType="decimal-pad"
                      placeholder="e.g. 7.5"
                      placeholderTextColor="#9ca3af"
                    />
                  </View>
                  <View>
                    <Text className="text-xs text-gray-500 mb-1">Role</Text>
                    <View className="flex-row space-x-2">
                      {(["player", "admin"] as const).map((role) => (
                        <TouchableOpacity
                          key={role}
                          onPress={() => setEditRole(role)}
                          className={`px-3 py-1.5 rounded-lg flex-1 items-center ${
                            editRole === role
                              ? "bg-green-600"
                              : "bg-gray-100 dark:bg-gray-800"
                          }`}
                        >
                          <Text
                            className={`text-xs font-medium capitalize ${
                              editRole === role
                                ? "text-white"
                                : "text-gray-700 dark:text-gray-300"
                            }`}
                          >
                            {role}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                </View>
              ) : (
                <View className="flex-row mt-2 space-x-3">
                  <View className="bg-gray-50 dark:bg-gray-800 rounded-lg px-2.5 py-1">
                    <Text className="text-xs text-gray-600 dark:text-gray-300">
                      Rating:{" "}
                      <Text className="font-semibold">
                        {item.skill_rating ?? "—"}
                      </Text>
                    </Text>
                  </View>
                  <View
                    className={`rounded-lg px-2.5 py-1 ${
                      item.role === "admin"
                        ? "bg-green-50 dark:bg-green-900/20"
                        : "bg-gray-50 dark:bg-gray-800"
                    }`}
                  >
                    <Text
                      className={`text-xs capitalize font-medium ${
                        item.role === "admin"
                          ? "text-green-700 dark:text-green-400"
                          : "text-gray-600 dark:text-gray-300"
                      }`}
                    >
                      {item.role}
                    </Text>
                  </View>
                </View>
              )}
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}
