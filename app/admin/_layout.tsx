import { Stack } from "expo-router";

export default function AdminLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: "#16a34a" },
        headerTintColor: "#ffffff",
        headerTitleStyle: { fontWeight: "bold" },
      }}
    >
      <Stack.Screen name="session-manager" options={{ title: "Session Manager" }} />
      <Stack.Screen name="round-control" options={{ title: "Round Control" }} />
      <Stack.Screen name="player-manager" options={{ title: "Player Manager" }} />
      <Stack.Screen name="announcements" options={{ title: "Announcements" }} />
    </Stack>
  );
}
