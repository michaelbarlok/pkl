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

/** Format date as Day M-D-YYYY (e.g. "Fri 3-15-2026") */
export function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
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
