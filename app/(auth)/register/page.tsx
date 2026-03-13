"use client";

import { useSupabase } from "@/components/providers/supabase-provider";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function RegisterPage() {
  const { supabase } = useSupabase();
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const hasMinLength = password.length >= 8;
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasNumber = /\d/.test(password);
  const passwordsMatch = password.length > 0 && password === confirmPassword;
  const passwordValid = hasMinLength && hasLetter && hasNumber && passwordsMatch;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!passwordValid) return;
    setError("");
    setLoading(true);

    // Sign up with Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    if (authData.user) {
      // Create profile via server-side API (bypasses RLS)
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: authData.user.id,
          fullName,
          email,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to create profile");
        setLoading(false);
        return;
      }
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="card">
      <h2 className="text-xl font-semibold text-dark-100 mb-6">Create account</h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="fullName" className="block text-sm font-medium text-dark-200 mb-1">
            Full Name
          </label>
          <input
            id="fullName"
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="input"
            required
          />
        </div>

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-dark-200 mb-1">
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input"
            required
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-dark-200 mb-1">
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input"
            required
          />
          {password.length > 0 && (
            <ul className="mt-2 space-y-1 text-sm">
              <li className={hasMinLength ? "text-green-400" : "text-red-400"}>
                {hasMinLength ? "\u2713" : "\u2717"} At least 8 characters
              </li>
              <li className={hasLetter ? "text-green-400" : "text-red-400"}>
                {hasLetter ? "\u2713" : "\u2717"} Contains a letter
              </li>
              <li className={hasNumber ? "text-green-400" : "text-red-400"}>
                {hasNumber ? "\u2713" : "\u2717"} Contains a number
              </li>
            </ul>
          )}
        </div>

        <div>
          <label htmlFor="confirmPassword" className="block text-sm font-medium text-dark-200 mb-1">
            Confirm Password
          </label>
          <input
            id="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="input"
            required
          />
          {confirmPassword.length > 0 && (
            <p className={`mt-2 text-sm ${passwordsMatch ? "text-green-400" : "text-red-400"}`}>
              {passwordsMatch ? "\u2713 Passwords match" : "\u2717 Passwords do not match"}
            </p>
          )}
        </div>

        {error && (
          <p className="text-sm text-red-400">{error}</p>
        )}

        <button type="submit" className="btn-primary w-full" disabled={loading || !passwordValid}>
          {loading ? "Creating account..." : "Create account"}
        </button>
      </form>

      <p className="mt-4 text-center text-sm text-surface-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-brand-600 hover:text-brand-500">
          Sign in
        </Link>
      </p>
    </div>
  );
}
