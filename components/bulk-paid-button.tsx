"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSupabase } from "@/components/providers/supabase-provider";
import { cn } from "@/lib/utils";

export interface UnpaidRegistration {
  id: string;
  playerName: string;
  partnerName: string | null;
  divisionLabel: string | null;
}

interface Props {
  unpaid: UnpaidRegistration[];
}

/**
 * Lets the organizer mark many teams paid in one click. With ~70
 * teams across 8-12 divisions, hand-toggling each PaidToggle on
 * tournament day is slow and error-prone — this opens a modal of
 * every unpaid team, lets the organizer tick the ones they collected
 * payment from, and fires a single bulk update.
 */
export function BulkPaidButton({ unpaid }: Props) {
  const { supabase } = useSupabase();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setSelected(new Set());
      setError(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !saving) setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, saving]);

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(unpaid.map((u) => u.id)));
  }

  function clearAll() {
    setSelected(new Set());
  }

  async function submit() {
    if (selected.size === 0) return;
    setSaving(true);
    setError(null);
    const ids = Array.from(selected);
    const { error: updErr } = await supabase
      .from("tournament_registrations")
      .update({ paid: true })
      .in("id", ids);
    setSaving(false);
    if (updErr) {
      setError(updErr.message);
      return;
    }
    // Tell every PaidToggle in the page that these ids just flipped
    // paid=true so they can update optimistic state without waiting
    // for router.refresh() to round-trip the server component. The
    // refresh still fires below to keep the "X of Y paid" header
    // counts and any other server-rendered totals in sync.
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("bulk-paid", { detail: { ids, paid: true } })
      );
    }
    setOpen(false);
    router.refresh();
  }

  if (unpaid.length === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn-secondary text-xs"
      >
        Bulk mark paid
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-4"
          aria-modal="true"
          role="dialog"
          aria-labelledby="bulk-paid-title"
        >
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
            onClick={() => !saving && setOpen(false)}
          />
          <div className="relative z-10 flex w-full max-w-lg flex-col max-h-[80vh] rounded-2xl bg-surface-raised shadow-2xl ring-1 ring-surface-border animate-scale-in">
            <div className="px-6 pt-6 pb-3">
              <h2 id="bulk-paid-title" className="text-base font-semibold text-dark-100">
                Mark teams as paid
              </h2>
              <p className="mt-1 text-xs text-surface-muted">
                Pick the teams you&apos;ve collected payment from, then mark them all in one go.
              </p>
              <div className="mt-3 flex items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={selectAll}
                  className="text-brand-vivid hover:underline"
                >
                  Select all ({unpaid.length})
                </button>
                <span className="text-surface-muted">·</span>
                <button
                  type="button"
                  onClick={clearAll}
                  className="text-surface-muted hover:text-dark-200"
                >
                  Clear
                </button>
                <span className="ml-auto text-surface-muted">
                  {selected.size} selected
                </span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto border-t border-surface-border">
              <ul className="divide-y divide-surface-border">
                {unpaid.map((reg) => {
                  const isOn = selected.has(reg.id);
                  return (
                    <li key={reg.id}>
                      <label
                        className={cn(
                          "flex cursor-pointer items-center gap-3 px-6 py-2.5 transition-colors",
                          isOn ? "bg-green-500/10" : "hover:bg-surface-overlay"
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={isOn}
                          onChange={() => toggleOne(reg.id)}
                          className="h-4 w-4 rounded border-surface-border accent-green-500"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-dark-100">
                            {reg.playerName}
                            {reg.partnerName && (
                              <span className="text-dark-200"> &amp; {reg.partnerName}</span>
                            )}
                          </p>
                          {reg.divisionLabel && (
                            <p className="truncate text-xs text-surface-muted">
                              {reg.divisionLabel}
                            </p>
                          )}
                        </div>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>

            {error && (
              <p className="px-6 pt-2 text-xs text-red-400">{error}</p>
            )}

            <div className="flex items-center justify-end gap-3 border-t border-surface-border px-6 py-4">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={saving}
                className="btn-secondary text-sm disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={saving || selected.size === 0}
                className="btn-base bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving
                  ? "Saving..."
                  : selected.size > 0
                    ? `Mark ${selected.size} paid`
                    : "Mark paid"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
