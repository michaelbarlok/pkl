"use client";

import { useSupabase } from "@/components/providers/supabase-provider";
import { Logo } from "@/components/logo";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
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
  const [error, setError] = useState<string | null>(null);

  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  useEffect(() => {
    async function verify() {
      // PKCE code exchange (fallback — some Supabase flows issue a code instead)
      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) {
          setError(exchangeError.message);
        } else {
          window.location.replace(next);
        }
        return;
      }

      // Standard email OTP token_hash flow
      if (token_hash && type) {
        const { error: verifyError } = await supabase.auth.verifyOtp({ token_hash, type });
        if (verifyError) {
          setError(verifyError.message);
        } else {
          window.location.replace(next);
        }
      }
    }

    if (token_hash || code) {
      verify();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // No params at all — invalid link
  if (!token_hash && !type && !code) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-dark-950 px-4">
        <div className="w-full max-w-md text-center space-y-4">
          <Logo className="mx-auto h-28 w-auto" />
          <p className="text-surface-muted">This confirmation link is invalid or has already been used.</p>
          <p className="text-sm text-surface-muted">If you need a new confirmation email, try signing in and following the prompt.</p>
          <a href="/login" className="btn-secondary inline-block">Back to Login</a>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-dark-950 px-4">
        <div className="w-full max-w-md text-center space-y-4">
          <Logo className="mx-auto h-28 w-auto" />
          <div className="rounded-lg bg-red-900/20 border border-red-500/30 px-4 py-3 text-sm text-red-400">
            {error}
            <p className="mt-1 text-xs text-surface-muted">
              The link may have expired. Please request a new confirmation email.
            </p>
          </div>
          <a href="/login" className="btn-secondary inline-block">Back to Login</a>
        </div>
      </div>
    );
  }

  // Verifying state
  return (
    <div className="flex min-h-screen items-center justify-center bg-dark-950 px-4">
      <div className="w-full max-w-md text-center space-y-4">
        <Logo className="mx-auto h-28 w-auto" />
        <p className="text-surface-muted">Confirming your email address…</p>
      </div>
    </div>
  );
}
