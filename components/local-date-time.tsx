"use client";

import { formatDateTime } from "@/lib/utils";
import { useEffect, useState } from "react";

/**
 * Renders a UTC timestamp formatted in the viewer's LOCAL timezone.
 *
 * Why this exists: Next.js server components render on Vercel (UTC),
 * so calling formatDateTime(iso) server-side prints the UTC clock,
 * not the viewer's. An organizer in ET who set "registration closes
 * at 6 PM ET" would see "10 PM" in the SSR HTML — confusing and wrong.
 *
 * Pattern: SSR renders an empty span (with suppressHydrationWarning
 * so React doesn't complain), then a useEffect on mount fills in the
 * local-time string. Brief flash on first render is fine — these
 * timestamps live inside collapsible cards and aren't above the fold.
 */
export function LocalDateTime({ iso }: { iso: string | null | undefined }) {
  const [text, setText] = useState<string>("");
  useEffect(() => {
    if (iso) setText(formatDateTime(iso));
  }, [iso]);
  if (!iso) return null;
  return <span suppressHydrationWarning>{text || "…"}</span>;
}
