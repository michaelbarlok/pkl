import { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/auth.store";
import { useSessionStore } from "@/store/session.store";
import { Session, SignUp } from "@/types/database";
import { formatDate, formatTime } from "@/lib/utils";

export default function SessionManagerScreen() {
  const { player } = useAuthStore();
  const { sessions, fetchSessions } = useSessionStore();
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [signUps, setSignUps] = useState<SignUp[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [loading, setLoading] = useState(false);

  // New session form
  const [location, setLocation] = useState("Athens Pickleball Club");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [maxPlayers, setMaxPlayers] = useState("16");
  const [numCourts, setNumCourts] = useState("4");

  useEffect(() => { fetchSessions(); }, []);

  const loadSignUps = async (session: Session) => {
    setSelectedSession(session);
    const { data } = await supabase
      .from("sign_ups")
      .select("*, player:players(*)")
      .eq("session_id", session.id)
      .neq("status", "withdrawn")
      .order("signed_up_at", { ascending: true });
    if (data) setSignUps(data as SignUp[]);
  };

  const createSession = async () => {
    if (!player || !date || !startTime) {
      Alert.alert("Error", "Please fill in all required fields.");
      return;
    }

    setLoading(true);
    const startDateTime = new Date(`${date}T${startTime}`);
    const cutoffTime = new Date(startDateTime.getTime() - 48 * 60 * 60 * 1000);

    const { error } = await supabase.from("sessions").insert({
      date,
      location,
      start_time: startDateTime.toISOString(),
      cutoff_time: cutoffTime.toISOString(),
      max_players: parseInt(maxPlayers),
      num_courts: parseInt(numCourts),
      status: "upcoming",
      created_by: player.id,
    });

    setLoading(false);
    if (error) {
      Alert.alert("Error", error.message);
    } else {
      setShowCreateModal(false);
      await fetchSessions();
    }
  };

  const updateSessionStatus = async (session: Session, status: Session["status"]) => {
    const { error } = await supabase
      .from("sessions")
      .update({ status })
      .eq("id", session.id);

    if (error) Alert.alert("Error", error.message);
    else fetchSessions();
  };

  const removePlayer = async (signUp: SignUp) => {
    Alert.alert(
      "Remove Player",
      `Remove ${signUp.player?.full_name} from this session?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            await supabase
              .from("sign_ups")
              .update({ status: "withdrawn" })
              .eq("id", signUp.id);
            if (selectedSession) loadSignUps(selectedSession);
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-gray-50 dark:bg-gray-950" edges={["bottom"]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <View className="px-5 pt-4">
          <TouchableOpacity
            onPress={() => setShowCreateModal(true)}
            className="bg-green-600 rounded-xl py-3.5 items-center mb-4"
          >
            <Text className="text-white font-bold">+ Create New Session</Text>
          </TouchableOpacity>

          {sessions.map((session) => (
            <TouchableOpacity
              key={session.id}
              onPress={() => loadSignUps(session)}
              className={`bg-white dark:bg-gray-900 rounded-xl p-4 mb-3 border ${
                selectedSession?.id === session.id
                  ? "border-green-500"
                  : "border-gray-100 dark:border-gray-800"
              }`}
            >
              <View className="flex-row justify-between items-start">
                <View>
                  <Text className="font-bold text-gray-900 dark:text-white">
                    {formatDate(session.date)}
                  </Text>
                  <Text className="text-gray-500 dark:text-gray-400 text-sm">
                    {session.location} · {formatTime(session.start_time)}
                  </Text>
                </View>
                <View className="bg-gray-100 dark:bg-gray-800 rounded-full px-2.5 py-1">
                  <Text className="text-xs text-gray-600 dark:text-gray-300 font-medium capitalize">
                    {session.status}
                  </Text>
                </View>
              </View>

              {selectedSession?.id === session.id && (
                <View className="mt-4">
                  {/* Status Controls */}
                  <Text className="text-xs font-semibold text-gray-500 uppercase mb-2">
                    Change Status
                  </Text>
                  <View className="flex-row flex-wrap gap-2 mb-4">
                    {(["upcoming", "active", "completed", "cancelled"] as const).map(
                      (status) => (
                        <TouchableOpacity
                          key={status}
                          onPress={() => updateSessionStatus(session, status)}
                          className={`px-3 py-1.5 rounded-full border ${
                            session.status === status
                              ? "bg-green-600 border-green-600"
                              : "border-gray-300 dark:border-gray-600"
                          }`}
                        >
                          <Text
                            className={`text-xs font-medium capitalize ${
                              session.status === status
                                ? "text-white"
                                : "text-gray-600 dark:text-gray-300"
                            }`}
                          >
                            {status}
                          </Text>
                        </TouchableOpacity>
                      )
                    )}
                  </View>

                  {/* Sign-Up List */}
                  <Text className="text-xs font-semibold text-gray-500 uppercase mb-2">
                    Players ({signUps.filter((s) => s.status === "confirmed").length}/
                    {session.max_players})
                  </Text>
                  {signUps.map((signup) => (
                    <View
                      key={signup.id}
                      className="flex-row items-center py-2.5 border-b border-gray-50 dark:border-gray-800"
                    >
                      <View
                        className={`w-2 h-2 rounded-full mr-3 ${
                          signup.status === "confirmed"
                            ? "bg-green-500"
                            : "bg-orange-400"
                        }`}
                      />
                      <Text className="flex-1 text-gray-900 dark:text-white text-sm">
                        {signup.player?.full_name}
                        {signup.status === "waitlist" &&
                          ` (waitlist #${signup.waitlist_position})`}
                      </Text>
                      <TouchableOpacity onPress={() => removePlayer(signup)}>
                        <Text className="text-red-500 text-sm">Remove</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {/* Create Session Modal */}
      <Modal visible={showCreateModal} transparent animationType="slide">
        <View className="flex-1 bg-black/50 justify-end">
          <View className="bg-white dark:bg-gray-900 rounded-t-3xl p-6">
            <Text className="text-xl font-bold text-gray-900 dark:text-white mb-4">
              New Session
            </Text>

            {[
              { label: "Location", value: location, onChange: setLocation, placeholder: "Location" },
              { label: "Date (YYYY-MM-DD)", value: date, onChange: setDate, placeholder: "2026-03-15" },
              { label: "Start Time (HH:MM)", value: startTime, onChange: setStartTime, placeholder: "18:00" },
              { label: "Max Players", value: maxPlayers, onChange: setMaxPlayers, placeholder: "16" },
              { label: "Number of Courts", value: numCourts, onChange: setNumCourts, placeholder: "4" },
            ].map((field) => (
              <View key={field.label} className="mb-3">
                <Text className="text-sm text-gray-700 dark:text-gray-300 mb-1">
                  {field.label}
                </Text>
                <TextInput
                  className="bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white px-4 py-3 rounded-xl"
                  value={field.value}
                  onChangeText={field.onChange}
                  placeholder={field.placeholder}
                  placeholderTextColor="#9ca3af"
                />
              </View>
            ))}

            <TouchableOpacity
              onPress={createSession}
              disabled={loading}
              className="bg-green-600 rounded-xl py-4 items-center mb-3 mt-2"
            >
              {loading ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text className="text-white font-bold">Create Session</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setShowCreateModal(false)}
              className="py-3 items-center"
            >
              <Text className="text-gray-500">Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
