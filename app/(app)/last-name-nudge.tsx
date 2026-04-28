"use client";

import { useSupabase } from "@/components/providers/supabase-provider";
import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Modal that pops on every page load for any signed-in user who
 * doesn't have a last_name on their profile yet. Once they save a
 * last name (and a first name if it was empty), the modal disappears
 * for the rest of the session and won't reappear next visit because
 * the column is now populated.
 *
 * On save we also keep full_name in sync ("First Last") when both
 * fields are filled. display_name is left alone — existing users may
 * have customized it ("Coach Mike", "Mike B.") and we don't want to
 * stomp that. New signups get display_name = full_name from the
 * register flow, so they're consistent out of the gate.
 *
 * Rendered from app/(app)/layout.tsx so it shows on every (app)
 * route. Auth pages (login/register) are in (auth) and aren't
 * affected.
 */
export function LastNameNudge({
  profileId,
  initialFirstName,
  initialLastName,
}: {
  profileId: string;
  initialFirstName: string | null;
  initialLastName: string | null;
}) {
  const { supabase } = useSupabase();
  const router = useRouter();
  const [firstName, setFirstName] = useState(initialFirstName ?? "");
  const [lastName, setLastName] = useState(initialLastName ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  // Already has a last name → don't render at all.
  if (initialLastName && initialLastName.trim().length > 0) return null;
  if (dismissed) return null;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const f = firstName.trim();
    const l = lastName.trim();
    if (!f || !l) {
      setError("First and last name are both required.");
      return;
    }

    setSaving(true);
    setError(null);

    const { error: updateErr } = await supabase
      .from("profiles")
      .update({
        first_name: f,
        last_name: l,
        full_name: `${f} ${l}`,
      })
      .eq("id", profileId);

    if (updateErr) {
      setError(updateErr.message || "Failed to save. Please try again.");
      setSaving(false);
      return;
    }

    setDismissed(true);
    setSaving(false);
    router.refresh();
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center bg-black/60 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="last-name-nudge-title"
    >
      <div className="w-full max-w-md rounded-xl bg-surface-raised border border-surface-border shadow-2xl p-6">
        <h2
          id="last-name-nudge-title"
          className="text-lg font-semibold text-dark-100"
        >
          Please add your last name
        </h2>
        <p className="mt-1 text-sm text-surface-muted">
          We&apos;re asking everyone to fill in their first and last name so
          organizers can tell players apart on sheets and rosters. This won&apos;t
          change the name shown on leaderboards or sign-ups.
        </p>

        <form onSubmit={handleSave} className="mt-4 space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label
                htmlFor="nudge-first-name"
                className="block text-sm font-medium text-dark-200 mb-1"
              >
                First Name
              </label>
              <input
                id="nudge-first-name"
                type="text"
                autoComplete="given-name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="input"
                required
                autoFocus={!firstName}
              />
            </div>
            <div>
              <label
                htmlFor="nudge-last-name"
                className="block text-sm font-medium text-dark-200 mb-1"
              >
                Last Name
              </label>
              <input
                id="nudge-last-name"
                type="text"
                autoComplete="family-name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="input"
                required
                autoFocus={!!firstName}
              />
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-400" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={saving || !firstName.trim() || !lastName.trim()}
            className="btn-primary w-full"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </form>
      </div>
    </div>
  );
}
