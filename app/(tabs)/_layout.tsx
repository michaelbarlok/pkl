import { Tabs } from "expo-router";
import { useColorScheme, View, Text } from "react-native";

function TabIcon({
  focused,
  label,
  emoji,
}: {
  focused: boolean;
  label: string;
  emoji: string;
}) {
  return (
    <View className="items-center justify-center pt-1">
      <Text style={{ fontSize: 22 }}>{emoji}</Text>
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
  const isDark = colorScheme === "dark";

  return (
    <Tabs
      initialRouteName="club"
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
        name="club"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} label="Club" emoji="🏟️" />
          ),
        }}
      />
      <Tabs.Screen
        name="play"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} label="Play" emoji="🏓" />
          ),
        }}
      />
      <Tabs.Screen
        name="sign-ups"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} label="Sign-Ups" emoji="📋" />
          ),
        }}
      />
      <Tabs.Screen
        name="members"
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} label="Members" emoji="👥" />
          ),
        }}
      />
      {/* Redirect index → club */}
      <Tabs.Screen name="index" options={{ href: null }} />
    </Tabs>
  );
}
