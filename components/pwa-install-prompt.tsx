"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { getExistingSubscription, isPushSupported } from "@/lib/push-client";

const STORAGE_VISITS = "pwa-install-visit-count";
const STORAGE_INSTALLED = "pwa-install-accepted";
// Set once the post-install "go set up push" nudge has been shown
// so we never fire it twice on the same device.
const STORAGE_POST_INSTALL_SHOWN = "pwa-push-setup-prompted";
// Session-scoped guard so a single browsing session only counts as
// one "visit" — multiple refreshes, client-side navigations, and
// React StrictMode double-mounts in dev don't all bump the counter.
const SESSION_COUNTED = "pwa-install-session-counted";
// iOS timestamp of the last time we showed the install banner.
// Safari can't tell us whether the user actually tapped Share → Add
// to Home Screen, so after showing the banner we assume they might
// have and go quiet for a while.
const STORAGE_IOS_SHOWN_AT = "pwa-install-ios-shown-at";
const IOS_SNOOZE_MS = 12 * 60 * 60 * 1000; // 12 hours

/**
 * Prompts authenticated users to install the PWA. Cadence:
 *   - Never on the first visit after login (let them settle in).
 *   - Shows on the 2nd visit, skips the 3rd, shows on the 4th, etc.
 *     i.e. every other visit starting from visit #2.
 *   - Once the user installs (either through our button or the
 *     browser's own menu, caught via the `appinstalled` event, or
 *     detected because we're already running in standalone mode),
 *     a localStorage flag locks the prompt off for good on that
 *     device — no more nagging.
 *
 * Platforms:
 *   - Chrome / Edge / Android: intercepts `beforeinstallprompt` and
 *     shows our own banner with a one-tap Install button that
 *     triggers the native prompt.
 *   - iOS Safari: no programmatic install API exists, so we show
 *     a themed instruction banner ("Tap Share, then Add to Home
 *     Screen").
 *
 * Mounted inside the authenticated AppLayout so unauthenticated
 * visitors never see it.
 */
export function PWAInstallPrompt({ profileId }: { profileId: string }) {
  const [mounted, setMounted] = useState(false);
  const [show, setShow] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  // The browser-provided install event — captured on
  // `beforeinstallprompt` and replayed when the user taps Install.
  // Typed loose because the BeforeInstallPromptEvent type isn't
  // in lib.dom and polyfilling for one property isn't worth it.
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  // Post-install nudge — shown once, points at the notification
  // preferences on the profile page so installed users flip from
  // email to push.
  const [showPostInstall, setShowPostInstall] = useState(false);

  useEffect(() => setMounted(true), []);

  /**
   * Fire the "now set up push notifications" modal — unless we've
   * already shown it on this device, or the user already has a
   * working push subscription (so no nudge needed).
   *
   * The flag gets set preemptively so concurrent triggers (e.g. the
   * appinstalled event firing alongside our userChoice fallback, or
   * a standalone mount racing a realtime reconnect) can never show
   * this modal twice.
   */
  async function maybeShowPostInstall() {
    if (typeof window === "undefined") return;
    if (localStorage.getItem(STORAGE_POST_INSTALL_SHOWN) === "true") return;
    localStorage.setItem(STORAGE_POST_INSTALL_SHOWN, "true");
    if (isPushSupported()) {
      const existing = await getExistingSubscription().catch(() => null);
      if (existing) return; // already subscribed, no nudge needed
    }
    setShowPostInstall(true);
  }

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Detect "already installed" through every signal available:
    //   - display-mode: standalone / minimal-ui / fullscreen — we're
    //     running inside the installed PWA shell right now.
    //   - navigator.standalone — iOS-specific, true when launched
    //     from the home screen.
    //   - getInstalledRelatedApps() — Chrome-only API that reports
    //     the PWA is installed on this device even if the user is
    //     currently in a regular tab on the same origin.
    //   - localStorage flag — our own historical signal from a
    //     previous appinstalled event or standalone detection. Stale
    //     after an uninstall, so it's always checked alongside at
    //     least one live signal before we trust it.
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      window.matchMedia("(display-mode: minimal-ui)").matches ||
      window.matchMedia("(display-mode: fullscreen)").matches ||
      (navigator as any).standalone === true;
    if (standalone) {
      const wasAlreadyInstalled =
        localStorage.getItem(STORAGE_INSTALLED) === "true";
      localStorage.setItem(STORAGE_INSTALLED, "true");
      if (!wasAlreadyInstalled) {
        maybeShowPostInstall();
      }
      return;
    }

    // Always register beforeinstallprompt FIRST — the browser only
    // fires it when the app is installable (i.e. not installed). If
    // the user uninstalled the PWA, localStorage still says
    // "installed" from the previous appinstalled event, so the flag
    // alone would keep the prompt suppressed forever. When the event
    // fires we invalidate the stale flag and show the banner so the
    // re-install path works.
    const onBip = (e: Event) => {
      e.preventDefault();
      localStorage.removeItem(STORAGE_INSTALLED);
      setDeferredPrompt(e);
      setShow(true);
    };
    const onInstalled = () => {
      localStorage.setItem(STORAGE_INSTALLED, "true");
      setShow(false);
      // Chromium path — the browser will still be open after
      // install. Fire the push-setup nudge here so users don't have
      // to go hunt for notification preferences themselves.
      maybeShowPostInstall();
    };
    window.addEventListener("beforeinstallprompt", onBip);
    window.addEventListener("appinstalled", onInstalled);
    const cleanup = () => {
      window.removeEventListener("beforeinstallprompt", onBip);
      window.removeEventListener("appinstalled", onInstalled);
    };

    // Chrome exposes getInstalledRelatedApps when the site is
    // listed in the manifest's related_applications and / or the
    // PWA was installed via this browser. Non-blocking — if it
    // reports the app installed, flip the flag (and retract any
    // banner we showed). If it reports empty AND the flag was set,
    // that's an uninstall signature — clear the stale flag.
    const nav = navigator as Navigator & {
      getInstalledRelatedApps?: () => Promise<{ platform: string; id?: string; url?: string }[]>;
    };
    if (typeof nav.getInstalledRelatedApps === "function") {
      nav.getInstalledRelatedApps()
        .then((apps) => {
          if (apps && apps.length > 0) {
            localStorage.setItem(STORAGE_INSTALLED, "true");
            setShow(false);
          } else if (localStorage.getItem(STORAGE_INSTALLED) === "true") {
            // Flag said installed, browser says no — user uninstalled
            // between sessions. Clear the flag so the cadence (and
            // the beforeinstallprompt listener we registered above)
            // can re-offer install.
            localStorage.removeItem(STORAGE_INSTALLED);
          }
        })
        .catch(() => {});
    }

    // If the flag says installed AND we haven't gotten a live signal
    // to the contrary yet, stay quiet for now. The beforeinstallprompt
    // listener stays armed — if the browser fires the event (the
    // authoritative "not installed" signal on Chrome), it clears the
    // flag and shows the banner then.
    if (localStorage.getItem(STORAGE_INSTALLED) === "true") return cleanup;

    // One visit = one session. sessionStorage clears on tab close
    // but persists across refreshes and StrictMode double-mounts,
    // so the counter only increments the first time we run in a
    // given session. Read the counter either way (even if we don't
    // increment) so the parity check below reflects the real count.
    let count = Number(localStorage.getItem(STORAGE_VISITS) ?? "0");
    if (sessionStorage.getItem(SESSION_COUNTED) !== "true") {
      count += 1;
      localStorage.setItem(STORAGE_VISITS, String(count));
      sessionStorage.setItem(SESSION_COUNTED, "true");
    }
    // Show on visits 2, 4, 6, … — every other visit starting with
    // the second (login visit stays quiet). Return cleanup so the
    // beforeinstallprompt listener still gets torn down on unmount.
    if (count < 2 || count % 2 !== 0) return cleanup;

    // iOS detection — userAgent because feature detection isn't
    // sufficient (iOS Safari doesn't fire beforeinstallprompt).
    const ios =
      /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    setIsIOS(ios);

    if (ios) {
      // Safari has no way to confirm the PWA actually got installed,
      // so we'd keep nagging forever. Stamp the time we show the
      // banner and stay silent for IOS_SNOOZE_MS afterward — long
      // enough for the user to actually install and come back
      // through their home-screen icon (which flips STORAGE_INSTALLED
      // and turns the prompt off for good).
      const lastShownRaw = localStorage.getItem(STORAGE_IOS_SHOWN_AT);
      const lastShown = lastShownRaw ? Number(lastShownRaw) : 0;
      if (Date.now() - lastShown < IOS_SNOOZE_MS) return cleanup;
      localStorage.setItem(STORAGE_IOS_SHOWN_AT, String(Date.now()));
      setShow(true);
      return cleanup;
    }

    // Chromium path: listener is already registered above — if the
    // browser fires beforeinstallprompt during this session, the
    // banner will appear then. If the site doesn't meet install
    // criteria (or the user dismissed the browser-level install
    // shelf recently), no event fires and we stay silent.
    return cleanup;
  }, []);

  async function install() {
    if (!deferredPrompt) return;
    let accepted = false;
    try {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") {
        accepted = true;
        localStorage.setItem(STORAGE_INSTALLED, "true");
      }
    } catch {
      // Some browsers throw if the event was consumed already;
      // accept the dismissal silently.
    }
    setDeferredPrompt(null);
    setShow(false);
    // Some Chromium flavors don't fire `appinstalled` reliably after
    // the userChoice promise resolves, so hand off to the nudge
    // ourselves if the user accepted.
    if (accepted) maybeShowPostInstall();
  }

  function dismiss() {
    setShow(false);
  }

  function dismissPostInstall() {
    localStorage.setItem(STORAGE_POST_INSTALL_SHOWN, "true");
    setShowPostInstall(false);
  }

  function openNotifSettings() {
    localStorage.setItem(STORAGE_POST_INSTALL_SHOWN, "true");
    setShowPostInstall(false);
    // Hash targets the notifications section on the profile edit
    // page so the user lands where they need to flip the switch.
    window.location.href = `/players/${profileId}/edit#notifications`;
  }

  if (!mounted) return null;
  if (!show && !showPostInstall) return null;

  const installBanner = show ? (
    <div className="fixed inset-x-0 bottom-0 z-[150] p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:p-6 pointer-events-none">
      <div className="mx-auto max-w-md pointer-events-auto rounded-2xl bg-surface-raised shadow-2xl ring-1 ring-surface-border animate-scale-in">
        <div className="flex items-start gap-3 p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-500/15 text-brand-vivid">
            {/* Download-arrow icon */}
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3.75v12m0 0 4.5-4.5M12 15.75l-4.5-4.5M5.25 20.25h13.5" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-dark-100">
              Install Tri-Star Pickleball
            </p>
            <p className="text-xs text-surface-muted mt-0.5 leading-relaxed">
              {isIOS ? (
                <>
                  Tap <span className="font-semibold text-dark-200">Share</span>, then{" "}
                  <span className="font-semibold text-dark-200">Add to Home Screen</span>
                  {" "}for instant launch and tournament alerts.
                </>
              ) : (
                "Install for instant launch and tournament alerts — no App Store needed."
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={dismiss}
            className="shrink-0 text-surface-muted hover:text-dark-100 -m-1 p-1"
            aria-label="Dismiss install prompt"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {!isIOS && (
          <div className="flex justify-end gap-2 px-4 pb-4">
            <button type="button" onClick={dismiss} className="btn-secondary text-xs">
              Later
            </button>
            <button type="button" onClick={install} className="btn-primary text-xs">
              Install
            </button>
          </div>
        )}
      </div>
    </div>
  ) : null;

  // Post-install nudge — fires once after a fresh install (or the
  // first standalone launch). Drives the user to their profile's
  // notification preferences so we can flip them from email to push.
  const postInstallModal = showPostInstall ? (
    <div
      className="fixed inset-0 z-[160] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pwa-post-install-title"
      onClick={dismissPostInstall}
    >
      <div
        className="relative w-full max-w-md rounded-2xl bg-surface-raised shadow-2xl ring-1 ring-surface-border animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-500/15 text-brand-vivid">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <h2 id="pwa-post-install-title" className="text-base font-semibold text-dark-100">
                You&rsquo;re in — turn on push notifications?
              </h2>
              <p className="mt-1 text-sm text-surface-muted leading-relaxed">
                Now that the app lives on your home screen, flip to push in your profile and you&rsquo;ll get instant court assignments, up-next pings, and tournament alerts instead of email.
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 border-t border-surface-border px-6 py-4">
          <button type="button" onClick={dismissPostInstall} className="btn-secondary text-sm">
            Not now
          </button>
          <button type="button" onClick={openNotifSettings} className="btn-primary text-sm">
            Open settings
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return createPortal(
    <>
      {installBanner}
      {postInstallModal}
    </>,
    document.body
  );
}
