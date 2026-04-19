import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Utility functions
 */

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Priority sort order: high first, then normal, then low. */
export const PRIORITY_ORDER: Record<string, number> = { high: 0, normal: 1, low: 2 };

/** Format date as Day M-D-YYYY (e.g. "Fri 3-15-2026").
 *
 *  Parses date-only ("YYYY-MM-DD") and no-zone ("YYYY-MM-DDTHH:mm[:ss]")
 *  strings in local time. Without this, JS parses bare dates as UTC
 *  midnight — so a DATE column value like "2026-04-19" renders as
 *  "Sat 4-18-2026" anywhere west of UTC. Strings with an explicit zone
 *  ("Z" or "+HH:mm") still parse normally. */
export function formatDate(dateStr: string): string {
  const noZone = dateStr.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?$/
  );
  const date = noZone
    ? new Date(
        Number(noZone[1]),
        Number(noZone[2]) - 1,
        Number(noZone[3]),
        Number(noZone[4] ?? "0"),
        Number(noZone[5] ?? "0"),
        Number(noZone[6] ?? "0")
      )
    : new Date(dateStr);
  const day = date.toLocaleDateString("en-US", { weekday: "short" });
  return `${day} ${date.getMonth() + 1}-${date.getDate()}-${date.getFullYear()}`;
}

/** Format time as H:MM am/pm (no leading zeros, 12-hour).
 *  Accepts a full datetime string OR a time-only string like "18:00" / "18:00:00". */
export function formatTime(timeOrDateStr: string): string {
  // Detect time-only strings (HH:MM or HH:MM:SS)
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(timeOrDateStr.trim())) {
    const [hStr, mStr] = timeOrDateStr.trim().split(":");
    let hours = parseInt(hStr, 10);
    const minutes = parseInt(mStr, 10);
    const ampm = hours >= 12 ? "pm" : "am";
    hours = hours % 12 || 12;
    return `${hours}:${minutes.toString().padStart(2, "0")} ${ampm}`;
  }
  const date = new Date(timeOrDateStr);
  let hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? "pm" : "am";
  hours = hours % 12 || 12;
  return `${hours}:${minutes.toString().padStart(2, "0")} ${ampm}`;
}

/** Format date and time together as M-D-YYYY H:MM am/pm */
export function formatDateTime(dateStr: string): string {
  return `${formatDate(dateStr)} ${formatTime(dateStr)}`;
}

/**
 * Zone-aware date formatter. Always resolves in the given IANA timezone
 * regardless of where the code runs (server, browser, whatever). Use
 * this for anything tied to a specific event/location — signup sheet
 * pages, emails, notifications — instead of `formatDate` / `formatTime`,
 * which fall back to the runtime's local zone.
 *
 * Accepts either a bare calendar date ("2026-04-22") — which is treated
 * as a wall-clock date and renders the same everywhere — or a full
 * datetime string / ISO timestamp, which is resolved against the zone.
 *
 * Output: "Fri 3-15-2026"
 */
export function formatDateInZone(dateStr: string, timeZone: string): string {
  const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const trimmed = dateStr.trim();

  // Bare YYYY-MM-DD — render as calendar date so a PG DATE column or
  // date-only string doesn't cross a day boundary when shown in a zone
  // west of UTC (e.g. "2026-04-22" formatted in America/New_York would
  // otherwise roll back to Apr 21).
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [y, m, d] = trimmed.split("-").map(Number);
    const noon = new Date(Date.UTC(y, m - 1, d, 12));
    const weekday = WEEKDAY_SHORT[noon.getUTCDay()];
    return `${weekday} ${m}-${d}-${y}`;
  }

  const date = new Date(trimmed);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("weekday")} ${get("month")}-${get("day")}-${get("year")}`;
}

/**
 * Zone-aware time formatter. Output: "8:00 pm".
 * Also accepts a bare "HH:MM" / "HH:MM:SS" string (rendered as-is).
 */
export function formatTimeInZone(dateStr: string, timeZone: string): string {
  const trimmed = dateStr.trim();
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(trimmed)) {
    const [hStr, mStr] = trimmed.split(":");
    let hours = parseInt(hStr, 10);
    const minutes = parseInt(mStr, 10);
    const ampm = hours >= 12 ? "pm" : "am";
    hours = hours % 12 || 12;
    return `${hours}:${minutes.toString().padStart(2, "0")} ${ampm}`;
  }
  const date = new Date(trimmed);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(date);
  const hour = parts.find((p) => p.type === "hour")?.value ?? "";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
  const dayPeriod = (parts.find((p) => p.type === "dayPeriod")?.value ?? "").toLowerCase();
  return `${hour}:${minute} ${dayPeriod}`;
}

/** Zone-aware date+time. Output: "Fri 3-15-2026 8:00 pm" */
export function formatDateTimeInZone(dateStr: string, timeZone: string): string {
  return `${formatDateInZone(dateStr, timeZone)} ${formatTimeInZone(dateStr, timeZone)}`;
}

export function getCountdown(targetDateStr: string): string {
  const now = new Date();
  const target = new Date(targetDateStr);
  const diffMs = target.getTime() - now.getTime();

  if (diffMs <= 0) return "Session is live!";

  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function formatWinPct(wins: number, losses: number): string {
  const total = wins + losses;
  if (total === 0) return "—";
  return `${Math.round((wins / total) * 100)}%`;
}

export function courtLabel(courtNumber: number): string {
  if (courtNumber === 1) return "Court 1 (Top)";
  return `Court ${courtNumber}`;
}

/**
 * Returns true if the email or display name belongs to a test account.
 * - display name contains "[TEST]" prefix (seeded test users)
 * - email is exactly a known test-only pattern (test@ or noreply@)
 * Use this to suppress outbound emails to test/seed users.
 */
export function isTestUser(
  email?: string | null,
  displayName?: string | null
): boolean {
  if (displayName && displayName.toLowerCase().includes("[test]")) return true;
  if (email) {
    const lower = email.toLowerCase();
    // Only block obviously synthetic test addresses, not real users who
    // happen to have "test" anywhere in their email (e.g. +tester1@gmail.com)
    if (/^test@/.test(lower) || /^testuser@/.test(lower) || /^noreply@/.test(lower)) return true;
  }
  return false;
  return false;
}
