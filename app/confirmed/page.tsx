"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function ConfirmedContent() {
  const searchParams = useSearchParams();
  const hasError = searchParams.get("error");

  if (hasError) {
    return (
      <div className="card text-center">
        <div className="text-4xl mb-4">&#x26A0;</div>
        <h2 className="text-xl font-semibold text-dark-100 mb-2">
          Verification failed
        </h2>
        <p className="text-surface-muted mb-6">
          This link may have expired or already been used. Please try registering
          again or contact us if you need help.
        </p>
        <Link href="/register" className="btn-primary inline-block">
          Back to Register
        </Link>
      </div>
    );
  }

  return (
    <div className="card text-center">
      <div className="text-4xl mb-4">&#x2705;</div>
      <h2 className="text-xl font-semibold text-dark-100 mb-2">
        Email verified!
      </h2>
      <p className="text-surface-muted mb-6">
        Thank you for verifying your email. Your account is ready to go.
      </p>
      <Link href="/login" className="btn-primary inline-block">
        Log in
      </Link>
    </div>
  );
}

export default function ConfirmedPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-dark-950 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <img src="/PKLBall.png" alt="PKL" className="mx-auto h-28 w-auto" />
        </div>
        <Suspense>
          <ConfirmedContent />
        </Suspense>
      </div>
    </div>
  );
}
