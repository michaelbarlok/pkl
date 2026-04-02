"use client";

import { FormError } from "@/components/form-error";
import { useSupabase } from "@/components/providers/supabase-provider";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterForm />
    </Suspense>
  );
}

function RegisterForm() {
  const { supabase } = useSupabase();
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/dashboard";
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);
  const [nameTouched, setNameTouched] = useState(false);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const showEmailError = emailTouched && email.length > 0 && !emailValid;
  const showNameError = nameTouched && fullName.trim().length === 0;

  const hasMinLength = password.length >= 8;
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasNumber = /\d/.test(password);
  const passwordsMatch = password.length > 0 && password === confirmPassword;
  const passwordValid = hasMinLength && hasLetter && hasNumber && passwordsMatch;

  // Password strength: 0-100
  const strengthChecks = [hasMinLength, hasLetter, hasNumber, passwordsMatch];
  const strengthPercent = password.length === 0 ? 0 : Math.round((strengthChecks.filter(Boolean).length / strengthChecks.length) * 100);
  const strengthColor = strengthPercent <= 25 ? "bg-red-500" : strengthPercent <= 50 ? "bg-accent-500" : strengthPercent <= 75 ? "bg-amber-500" : "bg-teal-500";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!passwordValid) return;
    setError("");
    setLoading(true);

    // Sign up with Supabase Auth — pass `next` through the email confirmation link
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
    const confirmUrl = `${appUrl}/auth/confirm?next=${encodeURIComponent(next)}`;
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: confirmUrl },
    });

    if (authError) {
      setError(authError.message || "Something went wrong. Please try again.");
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

    setRegistered(true);
  }

  if (registered) {
    return (
      <div className="card text-center">
        <div className="text-4xl mb-4">&#x2709;</div>
        <h2 className="text-xl font-semibold text-dark-100 mb-2">Check your email</h2>
        <p className="text-surface-muted mb-4">
          We sent a verification link to <span className="font-medium text-dark-200">{email}</span>.
          Click the link in the email to activate your account.
        </p>
        <p className="text-sm text-surface-muted">
          Didn&apos;t get it? Check your spam folder or{" "}
          <button
            type="button"
            onClick={() => setRegistered(false)}
            className="font-medium text-brand-400 hover:text-brand-300"
          >
            try again
          </button>.
        </p>
      </div>
    );
  }

  async function handleGoogleSignIn() {
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${process.env.NEXT_PUBLIC_APP_URL || window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    if (oauthError) {
      setError(oauthError.message);
    }
  }

  return (
    <div className="card">
      <div className="mb-6">
        <Link href="/" className="inline-flex items-center gap-1 text-sm text-dark-300 hover:text-dark-100 transition-colors mb-4">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          Back
        </Link>
        <h2 className="text-xl font-semibold text-dark-100">Create account</h2>
      </div>

      <button
        type="button"
        onClick={handleGoogleSignIn}
        className="btn-secondary w-full flex items-center justify-center gap-2 mb-4"
      >
        <svg className="h-5 w-5" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
        </svg>
        Sign up with Google
      </button>

      <div className="relative mb-4">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-surface-border"></div>
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="bg-surface-raised px-2 text-surface-muted">or</span>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="fullName" className="block text-sm font-medium text-dark-200 mb-1">
            Full Name
          </label>
          <input
            id="fullName"
            type="text"
            autoComplete="name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            onBlur={() => setNameTouched(true)}
            className={`input ${showNameError ? "input-error" : nameTouched && fullName.trim().length > 0 ? "input-success" : ""}`}
            required
          />
          {showNameError && (
            <p className="mt-1 text-xs text-red-400">Name is required</p>
          )}
        </div>

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-dark-200 mb-1">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => setEmailTouched(true)}
            className={`input ${showEmailError ? "input-error" : emailTouched && emailValid ? "input-success" : ""}`}
            required
          />
          {showEmailError && (
            <p className="mt-1 text-xs text-red-400">Enter a valid email address</p>
          )}
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-dark-200 mb-1">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input"
            required
          />
          {password.length > 0 && (
            <div className="mt-2 space-y-2">
              {/* Strength bar */}
              <div className="h-1.5 w-full rounded-full bg-surface-overlay overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${strengthColor}`}
                  style={{ width: `${strengthPercent}%` }}
                />
              </div>
              <ul role="list" aria-label="Password requirements" className="space-y-1 text-sm">
                <li className={hasMinLength ? "text-teal-300" : "text-surface-muted"}>
                  <span className="inline-flex items-center gap-1.5">
                    {hasMinLength ? (
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                    ) : (
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><circle cx="12" cy="12" r="8" /></svg>
                    )}
                    At least 8 characters
                  </span>
                </li>
                <li className={hasLetter ? "text-teal-300" : "text-surface-muted"}>
                  <span className="inline-flex items-center gap-1.5">
                    {hasLetter ? (
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                    ) : (
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><circle cx="12" cy="12" r="8" /></svg>
                    )}
                    Contains a letter
                  </span>
                </li>
                <li className={hasNumber ? "text-teal-300" : "text-surface-muted"}>
                  <span className="inline-flex items-center gap-1.5">
                    {hasNumber ? (
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                    ) : (
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><circle cx="12" cy="12" r="8" /></svg>
                    )}
                    Contains a number
                  </span>
                </li>
              </ul>
            </div>
          )}
        </div>

        <div>
          <label htmlFor="confirmPassword" className="block text-sm font-medium text-dark-200 mb-1">
            Confirm Password
          </label>
          <input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="input"
            required
          />
          {confirmPassword.length > 0 && (
            <p className={`mt-2 text-sm flex items-center gap-1.5 ${passwordsMatch ? "text-teal-300" : "text-red-300"}`} role="status">
              {passwordsMatch ? (
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
              ) : (
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              )}
              {passwordsMatch ? "Passwords match" : "Passwords do not match"}
            </p>
          )}
        </div>

        <FormError message={error} />

        <button type="submit" className="btn-primary w-full" disabled={loading || !passwordValid}>
          {loading ? "Creating account..." : "Create account"}
        </button>
      </form>

      <p className="mt-4 text-center text-sm text-surface-muted">
        Already have an account?{" "}
        <Link
          href={next !== "/dashboard" ? `/login?next=${encodeURIComponent(next)}` : "/login"}
          className="font-medium text-brand-400 hover:text-brand-300"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
