"use client";

import { useState } from "react";

interface Props {
  tournamentId: string;
  title: string;
  /** Short one-liner used as the Web Share API's `text` field. */
  summary?: string;
}

/**
 * Tournament share button — opens the native share sheet on mobile
 * (SMS, email, Messages, WhatsApp, etc.) via navigator.share and
 * falls back to clipboard on desktop. The shared URL is the
 * tournament detail page, so unauthenticated recipients land on
 * /login?next=/tournaments/<id> and get bounced back after signing up
 * or in (the middleware appends `next` on the redirect).
 */
export function ShareTournamentButton({ tournamentId, title, summary }: Props) {
  const [copied, setCopied] = useState(false);

  async function handleShare() {
    const url = `${window.location.origin}/tournaments/${tournamentId}`;
    const shareText = summary ?? `Check out ${title}`;

    // Prefer the native share sheet when available (mobile + some
    // desktop browsers). canShare() guards against desktop Firefox
    // exposing navigator.share with no usable targets.
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title, text: shareText, url });
        return;
      } catch (err: any) {
        // User cancelled — don't fall through to clipboard.
        if (err?.name === "AbortError") return;
        // Any other error (permission denied, target missing) falls
        // through to clipboard so the user still gets a usable link.
      }
    }

    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Old browsers / non-HTTPS origins — execCommand still works.
      const el = document.createElement("input");
      el.value = url;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      type="button"
      onClick={handleShare}
      className="btn-secondary text-xs shrink-0 inline-flex items-center gap-1.5"
      aria-label="Share tournament"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        className="h-3.5 w-3.5"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185Z" />
      </svg>
      {copied ? "Link copied" : "Share"}
    </button>
  );
}
