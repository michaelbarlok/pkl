/**
 * Theme preference utilities.
 *
 * Three possible values users can choose:
 *   - "light"  → always light
 *   - "dark"   → always dark
 *   - "system" → follow the OS / browser `prefers-color-scheme` live
 *
 * Storage: localStorage["theme"]. The legacy binary toggle also writes
 * "light" / "dark" here, so the two flows stay in sync.
 *
 * Rendering: a `.light` class on <html> turns on light mode. Dark is the
 * absence of that class. Adding "system" to the mix just means we
 * resolve the user's OS preference at read time (and re-resolve when it
 * changes — see useSystemThemeListener in components/theme-listener.tsx).
 */

export type ThemePreference = "light" | "dark" | "system";

const STORAGE_KEY = "theme";

function prefersLight(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-color-scheme: light)").matches;
}

/** Read the user's saved preference. Anything unexpected → "system". */
export function getStoredTheme(): ThemePreference {
  if (typeof window === "undefined") return "system";
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === "light" || raw === "dark" || raw === "system") return raw;
    return "system";
  } catch {
    return "system";
  }
}

/** Turn a preference into the concrete mode we should render right now. */
export function resolveTheme(pref: ThemePreference): "light" | "dark" {
  if (pref === "light") return "light";
  if (pref === "dark") return "dark";
  return prefersLight() ? "light" : "dark";
}

/** Apply + persist the user's theme choice. Safe on SSR (no-ops). */
export function applyTheme(pref: ThemePreference): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, pref);
  } catch {
    /* quota / private-mode — fall through to class update */
  }
  const resolved = resolveTheme(pref);
  const root = document.documentElement;
  if (resolved === "light") root.classList.add("light");
  else root.classList.remove("light");
}
