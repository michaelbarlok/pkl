import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Link, useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";

export default function RegisterScreen() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    if (!fullName || !email || !password) {
      Alert.alert("Error", "Please fill in all required fields.");
      return;
    }

    if (password.length < 6) {
      Alert.alert("Error", "Password must be at least 6 characters.");
      return;
    }

    setLoading(true);

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
    });

    if (authError || !authData.user) {
      setLoading(false);
      Alert.alert("Registration Failed", authError?.message ?? "Unknown error");
      return;
    }

    // Create player profile
    const { error: profileError } = await supabase.from("players").insert({
      user_id: authData.user.id,
      full_name: fullName,
      email,
      phone: phone || null,
      role: "player",
    });

    setLoading(false);

    if (profileError) {
      Alert.alert("Profile Error", profileError.message);
      return;
    }

    Alert.alert(
      "Welcome!",
      "Your account has been created. Check your email to verify your account.",
      [{ text: "OK", onPress: () => router.replace("/auth/login") }]
    );
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1 bg-white dark:bg-gray-950"
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="flex-1 justify-center px-6 py-12">
          {/* Header */}
          <View className="items-center mb-8">
            <Text className="text-6xl mb-3">🏓</Text>
            <Text className="text-2xl font-bold text-gray-900 dark:text-white">
              Create Account
            </Text>
            <Text className="text-gray-500 dark:text-gray-400 mt-1">
              Join the Athens Pickleball League
            </Text>
          </View>

          {/* Form */}
          <View className="space-y-4">
            <View>
              <Text className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Full Name <Text className="text-red-500">*</Text>
              </Text>
              <TextInput
                className="bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white px-4 py-3.5 rounded-xl text-base"
                placeholder="Your full name"
                placeholderTextColor="#9ca3af"
                value={fullName}
                onChangeText={setFullName}
                autoComplete="name"
                returnKeyType="next"
              />
            </View>

            <View>
              <Text className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Email <Text className="text-red-500">*</Text>
              </Text>
              <TextInput
                className="bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white px-4 py-3.5 rounded-xl text-base"
                placeholder="you@example.com"
                placeholderTextColor="#9ca3af"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
                returnKeyType="next"
              />
            </View>

            <View>
              <Text className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Phone (optional)
              </Text>
              <TextInput
                className="bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white px-4 py-3.5 rounded-xl text-base"
                placeholder="(555) 000-0000"
                placeholderTextColor="#9ca3af"
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                autoComplete="tel"
                returnKeyType="next"
              />
            </View>

            <View>
              <Text className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Password <Text className="text-red-500">*</Text>
              </Text>
              <TextInput
                className="bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white px-4 py-3.5 rounded-xl text-base"
                placeholder="Min. 6 characters"
                placeholderTextColor="#9ca3af"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoComplete="new-password"
                returnKeyType="done"
                onSubmitEditing={handleRegister}
              />
            </View>

            <TouchableOpacity
              onPress={handleRegister}
              disabled={loading}
              className="bg-green-600 rounded-xl py-4 items-center mt-2 active:bg-green-700"
            >
              {loading ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text className="text-white font-bold text-base">
                  Create Account
                </Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Login link */}
          <View className="flex-row justify-center mt-6">
            <Text className="text-gray-500 dark:text-gray-400">
              Already have an account?{" "}
            </Text>
            <Link href="/auth/login" asChild>
              <TouchableOpacity>
                <Text className="text-green-600 font-semibold">Sign In</Text>
              </TouchableOpacity>
            </Link>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
