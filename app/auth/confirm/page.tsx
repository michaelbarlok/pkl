"use client";

import { useSupabase } from "@/components/providers/supabase-provider";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import type { EmailOtpType } from "@supabase/supabase-js";

export default function ConfirmPage() {
  return (
    <Suspense>
      <ConfirmForm />
    </Suspense>
  );
}

function ConfirmForm() {
  const { supabase } = useSupabase();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/dashboard";

  async function handleConfirm() {
    if (!token_hash || !type) return;
    setLoading(true);
    setError(null);
    const { error: verifyError } = await supabase.auth.verifyOtp({ token_hash, type });
    if (verifyError) {
      setError(verifyError.message);
      setLoading(false);
    } else {
      router.push(next);
    }
  }

  if (!token_hash || !type) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-dark-950 px-4">
        <div className="w-full max-w-md text-center space-y-4">
          <img src="/pkl-logo.png" alt="PKL" className="mx-auto h-28 w-auto" />
          <p className="text-surface-muted">This confirmation link is invalid or missing required parameters.</p>
          <a href="/login" className="btn-secondary inline-block">Back to Login</a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-dark-950 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <img src="/pkl-logo.png" alt="PKL" className="mx-auto h-28 w-auto" />
        </div>
        <div className="card space-y-6 text-center">
          <div>
            <h1 className="text-xl font-bold text-dark-100">Confirm your email</h1>
            <p className="mt-2 text-sm text-surface-muted">
              Click the button below to verify your email address and activate your account.
            </p>
          </div>
          {error && (
            <div className="rounded-lg bg-red-900/20 border border-red-500/30 px-4 py-3 text-sm text-red-400">
              {error}
              <p className="mt-1 text-xs text-surface-muted">
                The link may have expired. Please request a new confirmation email.
              </p>
            </div>
          )}
          <button
            onClick={handleConfirm}
            disabled={loading}
            className="btn-primary w-full"
          >
            {loading ? "Confirming…" : "Confirm Email Address"}
          </button>
          <p className="text-xs text-surface-muted">
            Already confirmed?{" "}
            <a href="/login" className="text-brand-300 hover:text-brand-200">
              Sign in
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
