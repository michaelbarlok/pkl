"use client";

import { FormError } from "@/components/form-error";
import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

type Tab = "email" | "link";
type EmailStatus = "idle" | "sending" | "sent" | "error";

export function InviteButton({
  groupId,
  groupSlug,
  groupName,
  groupVisibility,
}: {
  groupId: string;
  groupSlug: string;
  groupName: string;
  groupVisibility: string;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("email");
  const [email, setEmail] = useState("");
  const [emailStatus, setEmailStatus] = useState<EmailStatus>("idle");
  const [emailError, setEmailError] = useState("");
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [loadingUrl, setLoadingUrl] = useState(false);
  const [copied, setCopied] = useState(false);
  const emailInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus email input when modal opens
  useEffect(() => {
    if (open && tab === "email") {
      setTimeout(() => emailInputRef.current?.focus(), 50);
    }
  }, [open, tab]);

  // Generate the invite URL when the link tab is first opened
  useEffect(() => {
    if (tab === "link" && !inviteUrl && !loadingUrl) {
      generateUrl();
    }
  }, [tab]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    if (open) window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  function close() {
    setOpen(false);
    setTab("email");
    setEmail("");
    setEmailStatus("idle");
    setEmailError("");
    setInviteUrl(null);
    setCopied(false);
  }

  async function generateUrl() {
    // For public groups, no token needed — the group URL is shareable as-is
    if (groupVisibility === "public") {
      setInviteUrl(`${window.location.origin}/groups/${groupSlug}`);
      return;
    }
    // For private groups, create a token via the API
    setLoadingUrl(true);
    try {
      const res = await fetch(`/api/groups/${groupId}/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupName, groupSlug, visibility: groupVisibility }),
      });
      const data = await res.json();
      setInviteUrl(data.url ?? null);
    } catch {
      // silently fail — user can retry
    } finally {
      setLoadingUrl(false);
    }
  }

  async function sendEmail() {
    if (!email.trim()) return;
    setEmailStatus("sending");
    setEmailError("");
    try {
      const res = await fetch(`/api/groups/${groupId}/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          groupName,
          groupSlug,
          visibility: groupVisibility,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setEmailError(data.error ?? "Failed to send invite");
        setEmailStatus("error");
      } else {
        setEmailStatus("sent");
        setEmail("");
      }
    } catch {
      setEmailError("Something went wrong. Please try again.");
      setEmailStatus("error");
    }
  }

  async function copyLink() {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback: select text in input
    }
  }

  async function shareLink() {
    if (!inviteUrl) return;
    try {
      await navigator.share({
        title: `Join ${groupName} on PKL Ball`,
        text: `You're invited to join ${groupName} — a pickleball group on PKL Ball!`,
        url: inviteUrl,
      });
    } catch {
      // User cancelled or share not available
    }
  }

  const canShare =
    typeof navigator !== "undefined" && typeof navigator.share === "function";

  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-secondary">
        Invite Player
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60"
            onClick={close}
          />

          {/* Modal */}
          <div className="relative w-full max-w-md max-h-[calc(100vh-2rem)] overflow-y-auto rounded-xl bg-surface-raised shadow-2xl ring-1 ring-surface-border">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-surface-border px-5 py-4">
              <h3 className="text-base font-semibold text-dark-100">
                Invite to {groupName}
              </h3>
              <button
                onClick={close}
                className="rounded-md p-1 text-surface-muted hover:bg-surface-overlay hover:text-dark-200"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-surface-border">
              <button
                onClick={() => setTab("email")}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 py-2.5 text-sm font-medium transition-colors",
                  tab === "email"
                    ? "border-b-2 border-brand-500 text-brand-300"
                    : "text-surface-muted hover:text-dark-200"
                )}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
                </svg>
                Email Invite
              </button>
              <button
                onClick={() => setTab("link")}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 py-2.5 text-sm font-medium transition-colors",
                  tab === "link"
                    ? "border-b-2 border-brand-500 text-brand-300"
                    : "text-surface-muted hover:text-dark-200"
                )}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
                </svg>
                Share Link
              </button>
            </div>

            {/* Tab Content */}
            <div className="p-5">
              {tab === "email" ? (
                <div className="space-y-3">
                  <p className="text-sm text-surface-muted">
                    Enter their email address and we&apos;ll send them an
                    invitation with a link to join this group.
                  </p>
                  <input
                    ref={emailInputRef}
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (emailStatus !== "idle") {
                        setEmailStatus("idle");
                        setEmailError("");
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") sendEmail();
                    }}
                    placeholder="player@example.com"
                    className="input w-full"
                  />
                  {emailStatus === "sent" && (
                    <p className="flex items-center gap-1.5 text-sm text-teal-300">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                      </svg>
                      Invite sent!
                    </p>
                  )}
                  {emailStatus === "error" && (
                    <FormError message={emailError} />
                  )}
                  <button
                    onClick={sendEmail}
                    disabled={!email.trim() || emailStatus === "sending"}
                    className="btn-primary w-full"
                  >
                    {emailStatus === "sending" ? "Sending..." : "Send Invite"}
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-surface-muted">
                    Share this link via SMS, email, or any app. If they
                    don&apos;t have an account yet, they&apos;ll be prompted to
                    register first.
                  </p>
                  {loadingUrl ? (
                    <div className="flex items-center gap-2 text-sm text-surface-muted">
                      <svg className="h-4 w-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Generating link…
                    </div>
                  ) : inviteUrl ? (
                    <>
                      <div className="flex items-center gap-2 rounded-lg bg-surface-overlay px-3 py-2 ring-1 ring-surface-border">
                        <span className="flex-1 truncate text-xs text-dark-200 font-mono">
                          {inviteUrl}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={copyLink}
                          className={cn(
                            "btn-secondary flex flex-1 items-center justify-center gap-1.5",
                            copied && "text-teal-300"
                          )}
                        >
                          {copied ? (
                            <>
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
                                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                              </svg>
                              Copied!
                            </>
                          ) : (
                            <>
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" />
                              </svg>
                              Copy Link
                            </>
                          )}
                        </button>
                        {canShare && (
                          <button
                            onClick={shareLink}
                            className="btn-secondary flex flex-1 items-center justify-center gap-1.5"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185Z" />
                            </svg>
                            Share
                          </button>
                        )}
                      </div>
                    </>
                  ) : (
                    <button onClick={generateUrl} className="btn-secondary w-full">
                      Generate Link
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
