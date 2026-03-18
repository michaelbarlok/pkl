"use client";

import { FormError } from "@/components/form-error";
import { useSupabase } from "@/components/providers/supabase-provider";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function ResetPasswordPage() {
  const { supabase } = useSupabase();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    const { error: updateError } = await supabase.auth.updateUser({
      password,
    });

    setLoading(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setSuccess(true);
  }

  if (success) {
    return (
      <div className="card text-center">
        <div className="text-4xl mb-4">&#x2705;</div>
        <h2 className="text-xl font-semibold text-dark-100 mb-2">
          Password updated!
        </h2>
        <p className="text-surface-muted mb-6">
          Your password has been reset successfully.
        </p>
        <button
          onClick={() => {
            router.push("/dashboard");
            router.refresh();
          }}
          className="btn-primary inline-block"
        >
          Go to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="card">
      <h2 className="text-xl font-semibold text-dark-100 mb-2 text-center">
        Set a new password
      </h2>
      <p className="text-surface-muted mb-6 text-center">
        Enter your new password below.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-dark-200 mb-1">
            New Password
          </label>
          <input
            id="password"
            type="password"
            className="input w-full"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 6 characters"
            required
          />
        </div>

        <div>
          <label htmlFor="confirmPassword" className="block text-sm font-medium text-dark-200 mb-1">
            Confirm Password
          </label>
          <input
            id="confirmPassword"
            type="password"
            className="input w-full"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Confirm your password"
            required
          />
        </div>

        <FormError message={error} />

        <button
          type="submit"
          className="btn-primary w-full"
          disabled={loading}
        >
          {loading ? "Updating..." : "Update Password"}
        </button>
      </form>
    </div>
  );
}
