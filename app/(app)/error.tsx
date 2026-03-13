"use client";

export default function AppError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center text-center">
      <h2 className="text-xl font-semibold text-dark-100">Something went wrong</h2>
      <p className="mt-2 text-sm text-surface-muted">{error.message || "An unexpected error occurred."}</p>
      <button onClick={reset} className="btn-primary mt-4">
        Try again
      </button>
    </div>
  );
}
