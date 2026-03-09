import { Tabs } from "expo-router";
import { useColorScheme, View, Text } from "react-native";
import { useAnnouncementsStore } from "@/store/announcements.store";

function TabIcon({
  focused,
  label,
  emoji,
  badge,
}: {
  focused: boolean;
  label: string;
  emoji: string;
  badge?: number;
}) {
  return (
    <View className="items-center justify-center pt-1">
      <View>
        <Text style={{ fontSize: 22 }}>{emoji}</Text>
        {badge != null && badge > 0 && (
          <View className="absolute -top-1 -right-2 bg-red-500 rounded-full w-4 h-4 items-center justify-center">
            <Text className="text-white text-xs font-bold">{badge}</Text>
          </View>
        )}
      </View>
      <Text
        className={`text-xs mt-0.5 ${focused ? "text-green-600 font-semibold" : "text-gray-500"}`}
      >
        {label}
      </Text>
    </View>
  );
}

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const { unreadCount } = useAnnouncementsStore();
  const isDark = colorScheme === "dark";

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: {
          backgroundColor: isDark ? "#111827" : "#ffffff",
          borderTopColor: isDark ? "#374151" : "#e5e7eb",
          height: 60,
          paddingBottom: 8,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} label="Home" emoji="🏠" />
          ),
        }}
      />
      <Tabs.Screen
        name="live"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} label="Live" emoji="🎾" />
          ),
        }}
      />
      <Tabs.Screen
        name="standings"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} label="Standings" emoji="🏆" />
          ),
        }}
      />
      <Tabs.Screen
        name="inbox"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} label="Inbox" emoji="📬" badge={unreadCount} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} label="Profile" emoji="👤" />
          ),
        }}
      />
    </Tabs>
  );
}
