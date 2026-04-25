"use client";

import { useEffect, useState } from "react";
import { fifteenMinuteSlots } from "@/lib/datetime-local";

interface Props {
  /** "YYYY-MM-DDTHH:MM" wall-clock string (the same shape that
   *  <input type="datetime-local"> produces) or "" for unset. */
  value: string;
  onChange: (next: string) => void;
  /** Optional min/max for the date side, formatted as YYYY-MM-DD. */
  minDate?: string;
  maxDate?: string;
  className?: string;
}

const TIME_SLOTS = fifteenMinuteSlots();

/**
 * Composite picker that enforces 15-minute increments. Two controls
 * — a date input and a select of preset times — feed a single
 * `YYYY-MM-DDTHH:MM` value back to the parent so caller code can keep
 * using the same `localDateTimeToIso` round-trip helpers as before.
 *
 * Both halves are kept in LOCAL state and persist across re-renders.
 * The composite only emits a real value upward once both date and
 * time are set; while the user is mid-input we emit "" to the
 * parent but DO NOT echo "" back into our own inputs. Without this,
 * typing the date would emit "" → parent re-renders with value="" →
 * the date input would clear what the user just typed (the bug
 * users hit on the registration window fields).
 */
export function DateTimeFifteenMin({
  value,
  onChange,
  minDate,
  maxDate,
  className,
}: Props) {
  const split = (v: string): { d: string; t: string } => {
    if (!v) return { d: "", t: "" };
    const [d, t] = v.split("T");
    return { d: d ?? "", t: (t ?? "").slice(0, 5) };
  };

  const initial = split(value);
  const [date, setDate] = useState(initial.d);
  const [time, setTime] = useState(initial.t);

  // Sync from props when the parent provides a real value (e.g. an
  // edit form loading existing data). We deliberately ignore
  // value === "" so the half-typed state isn't wiped when our own
  // partial-value emit clears the parent.
  useEffect(() => {
    if (!value) return;
    const { d, t } = split(value);
    setDate((prev) => (prev === d ? prev : d));
    setTime((prev) => (prev === t ? prev : t));
  }, [value]);

  function update(nextDate: string, nextTime: string) {
    setDate(nextDate);
    setTime(nextTime);
    if (nextDate && nextTime) {
      onChange(`${nextDate}T${nextTime}`);
    } else {
      onChange("");
    }
  }

  return (
    <div className={className ?? "grid grid-cols-[1fr_auto] gap-2"}>
      <input
        type="date"
        value={date}
        min={minDate}
        max={maxDate}
        onChange={(e) => update(e.target.value, time)}
        className="input"
      />
      <select
        value={time}
        onChange={(e) => update(date, e.target.value)}
        className="input"
      >
        <option value="">—</option>
        {TIME_SLOTS.map((slot) => (
          <option key={slot.value} value={slot.value}>
            {slot.label}
          </option>
        ))}
      </select>
    </div>
  );
}
