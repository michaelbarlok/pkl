"use client";

import { FormError } from "@/components/form-error";
import { useSupabase } from "@/components/providers/supabase-provider";
import Link from "next/link";
import { useState } from "react";

export default function ForgotPasswordPage() {
  const { supabase } = useSupabase();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email,
      { redirectTo: `${window.location.origin}/auth/confirm` }
    );

    setLoading(false);

    if (resetError) {
      setError(resetError.message);
      return;
    }

    setSent(true);
  }

  if (sent) {
    return (
      <div className="card text-center">
        <div className="text-4xl mb-4">&#x2709;</div>
        <h2 className="text-xl font-semibold text-dark-100 mb-2">
          Check your email
        </h2>
        <p className="text-surface-muted mb-6">
          We sent a password reset link to{" "}
          <span className="font-medium text-dark-200">{email}</span>. Click the
          link in the email to reset your password.
        </p>
        <Link href="/login" className="text-sm font-medium text-brand-400 hover:text-brand-300">
          Back to Sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="card">
      <h2 className="text-xl font-semibold text-dark-100 mb-2">
        Reset your password
      </h2>
      <p className="text-surface-muted mb-6">
        Enter your email and we&apos;ll send you a link to reset your password.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-dark-200 mb-1">
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input w-full"
            required
          />
        </div>

        <FormError message={error} />

        <button type="submit" className="btn-primary w-full" disabled={loading}>
          {loading ? "Sending..." : "Send reset link"}
        </button>
      </form>

      <p className="mt-4 text-center text-sm text-surface-muted">
        <Link href="/login" className="font-medium text-brand-400 hover:text-brand-300">
          Back to Sign in
        </Link>
      </p>
    </div>
  );
}
