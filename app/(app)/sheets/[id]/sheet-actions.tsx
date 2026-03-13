"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { RegistrationStatus } from "@/types/database";

interface SheetActionsProps {
  sheetId: string;
  profileId: string;
  myRegistration: { id: string; status: RegistrationStatus } | null;
  signupClosed: boolean;
  withdrawClosed: boolean;
  isFull: boolean;
}

export function SheetActions({
  sheetId,
  profileId,
  myRegistration,
  signupClosed,
  withdrawClosed,
  isFull,
}: SheetActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignUp() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/sheets/${sheetId}/signup`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to sign up.");
      }
      router.refresh();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to sign up.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  async function handleWithdraw() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/sheets/${sheetId}/withdraw`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to withdraw.");
      }
      router.refresh();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to withdraw.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  const isRegistered =
    myRegistration &&
    (myRegistration.status === "confirmed" ||
      myRegistration.status === "waitlist");

  return (
    <div className="card">
      {error && (
        <div className="mb-4 rounded-md bg-red-900/30 p-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {isRegistered ? (
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-dark-100">
              You are{" "}
              {myRegistration.status === "confirmed" ? (
                <span className="text-teal-300">confirmed</span>
              ) : (
                <span className="text-accent-300">on the waitlist</span>
              )}
              .
            </p>
          </div>
          <button
            onClick={handleWithdraw}
            disabled={loading || withdrawClosed}
            className="btn-danger"
            title={
              withdrawClosed ? "Withdraw deadline has passed" : undefined
            }
          >
            {loading ? "Withdrawing..." : "Withdraw"}
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-dark-100">
              {signupClosed
                ? "Sign-up is closed for this event."
                : isFull
                  ? "This event is full. You can join the waitlist."
                  : "Sign up for this event."}
            </p>
          </div>
          <button
            onClick={handleSignUp}
            disabled={loading || signupClosed}
            className="btn-primary"
          >
            {loading
              ? "Signing up..."
              : isFull
                ? "Join Waitlist"
                : "Sign Up"}
          </button>
        </div>
      )}

      {withdrawClosed && isRegistered && (
        <p className="mt-2 text-sm text-surface-muted">
          The withdraw deadline has passed. Contact an admin to withdraw.
        </p>
      )}
    </div>
  );
}
