"use client";

import { fifteenMinuteSlots } from "@/lib/datetime-local";
import { getDivisionLabel, getDivisionGender } from "@/lib/divisions";
import { memo } from "react";

interface Props {
  selectedDivisions: string[];
  /** Map of division code → "HH:MM" wall-clock string. Empty means
   *  "no override, fall back to the tournament-level start_time". */
  values: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
  /** Tournament-level start_time so we can hint "fallback" copy. */
  defaultTime?: string;
}

// Pre-built 15-min options used by every per-division select.
const TIME_SLOTS = fifteenMinuteSlots();

/**
 * Per-division start-time inputs. Renders one row per selected
 * division so an organizer can stagger Men's at 8am, Women's at
 * 10:30, Mixed at 2 etc. on a shared event day. Mixed divisions
 * MUST start at a different time than gendered ones (a player
 * commonly enters one gendered + one mixed and can't physically
 * play both at the same time) — that constraint is checked at
 * submit by the parent form, not here.
 */
function DivisionStartTimesInner({
  selectedDivisions,
  values,
  onChange,
  defaultTime,
}: Props) {
  if (selectedDivisions.length === 0) return null;

  return (
    <div className="rounded-lg border border-surface-border p-4 space-y-3">
      <div>
        <p className="text-sm font-medium text-dark-200">Division start times (optional)</p>
        <p className="text-xs text-surface-muted mt-0.5">
          Override the tournament start time per division. Mixed needs a different time than Men&apos;s and Women&apos;s so a player entered in both can attend both.
        </p>
      </div>
      <div className="space-y-2">
        {selectedDivisions.map((code) => {
          const gender = getDivisionGender(code);
          return (
            <div key={code} className="grid grid-cols-[1fr_auto] items-center gap-3">
              <div className="min-w-0">
                <p className="text-sm text-dark-100 truncate">{getDivisionLabel(code)}</p>
                {gender === "mixed" && (
                  <p className="text-[11px] text-accent-300">
                    Mixed — pick a different time than Men&apos;s and Women&apos;s
                  </p>
                )}
              </div>
              <select
                value={values[code] ?? ""}
                onChange={(e) => onChange({ ...values, [code]: e.target.value })}
                className="input text-sm py-1.5 px-2 w-32"
                aria-label={`${getDivisionLabel(code)} start time`}
              >
                <option value="">
                  {defaultTime ? "default" : "—"}
                </option>
                {TIME_SLOTS.map((slot) => (
                  <option key={slot.value} value={slot.value}>
                    {slot.label}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Memoized so unrelated parent re-renders don't churn the per-
 * division <select> rows. With 12 divisions selected each row has
 * ~65 time options — so without memo, every keystroke in title /
 * location / description was re-rendering ~780 <option> elements.
 * Re-renders only when selectedDivisions, values, onChange, or
 * defaultTime change. The parent passes a useState setter for
 * onChange (stable) and the array/record refs only change when
 * their own state changes — no-op render in the keystroke case.
 */
export const DivisionStartTimes = memo(DivisionStartTimesInner);
