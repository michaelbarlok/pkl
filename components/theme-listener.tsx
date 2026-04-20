"use client";

import { useEffect } from "react";
import { applyTheme, getStoredTheme } from "@/lib/theme";

/**
 * Keeps the rendered theme in sync with the OS when the user's
 * preference is "system". Mounted once in the authenticated app
 * layout. A no-op for users who picked "light" or "dark" explicitly.
 */
export function ThemeListener() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-color-scheme: light)");

    function onChange() {
      // Only re-apply if the user's preference is still "system".
      // If they explicitly chose light/dark in the meantime we leave
      // their choice alone.
      if (getStoredTheme() === "system") applyTheme("system");
    }

    // addEventListener over addListener — the latter is deprecated and
    // fires inconsistently across browsers.
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return null;
}
