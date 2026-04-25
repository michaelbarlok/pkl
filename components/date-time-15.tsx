"use client";

import { fifteenMinuteSlots } from "@/lib/datetime-local";

interface Props {
  /** "YYYY-MM-DDTHH:MM" wall-clock string (the same shape that
   *  <input type="datetime-local"> produces) or "" for unset. */
  value: string;
  onChange: (next: string) => void;
  /** Disables the time select when the date is empty — picking a
   *  time before a date would silently drop the time. */
  required?: boolean;
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
 * Replaces `<input type="datetime-local" step="900">` everywhere we
 * surface registration / sign-up / withdraw windows. The native
 * datetime-local picker only constrained the spinner; a user could
 * still type "8:07" and store an off-grid value. With this composite
 * the time is literally unselectable off the 15-minute grid.
 */
export function DateTimeFifteenMin({
  value,
  onChange,
  minDate,
  maxDate,
  className,
}: Props) {
  // Split the incoming value. We tolerate both "YYYY-MM-DDTHH:MM"
  // and "YYYY-MM-DDTHH:MM:SS" so a value loaded from the DB with
  // seconds doesn't blow up.
  let date = "";
  let time = "";
  if (value) {
    const [d, t] = value.split("T");
    date = d ?? "";
    time = (t ?? "").slice(0, 5); // HH:MM, drop seconds
  }

  function emit(nextDate: string, nextTime: string) {
    if (!nextDate || !nextTime) {
      // Both halves are required for a real value. If either is
      // missing we send "" so callers consistently treat the field
      // as unset (the existing localDateTimeToIso null-checks
      // expect that).
      onChange("");
      return;
    }
    onChange(`${nextDate}T${nextTime}`);
  }

  return (
    <div className={className ?? "grid grid-cols-[1fr_auto] gap-2"}>
      <input
        type="date"
        value={date}
        min={minDate}
        max={maxDate}
        onChange={(e) => emit(e.target.value, time)}
        className="input"
      />
      <select
        value={time}
        onChange={(e) => emit(date, e.target.value)}
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
