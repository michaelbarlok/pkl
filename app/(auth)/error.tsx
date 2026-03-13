"use client";

export default function AuthError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="text-center">
      <h2 className="text-xl font-semibold text-dark-100">Authentication Error</h2>
      <p className="mt-2 text-sm text-surface-muted">{error.message || "Something went wrong."}</p>
      <button onClick={reset} className="mt-4 text-sm font-medium text-brand-600 hover:text-brand-700">
        Try again
      </button>
    </div>
  );
}
