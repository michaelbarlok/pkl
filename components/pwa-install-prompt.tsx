"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

const STORAGE_VISITS = "pwa-install-visit-count";
const STORAGE_INSTALLED = "pwa-install-accepted";

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
export function PWAInstallPrompt() {
  const [mounted, setMounted] = useState(false);
  const [show, setShow] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  // The browser-provided install event — captured on
  // `beforeinstallprompt` and replayed when the user taps Install.
  // Typed loose because the BeforeInstallPromptEvent type isn't
  // in lib.dom and polyfilling for one property isn't worth it.
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // If the app is already running in standalone/installed mode,
    // mark the flag and bail so we never prompt again.
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      window.matchMedia("(display-mode: minimal-ui)").matches ||
      window.matchMedia("(display-mode: fullscreen)").matches ||
      (navigator as any).standalone === true;
    if (standalone) {
      localStorage.setItem(STORAGE_INSTALLED, "true");
      return;
    }

    if (localStorage.getItem(STORAGE_INSTALLED) === "true") return;

    // Increment the visit counter on each fresh mount. Only show
    // the prompt on visits 2, 4, 6, ... — every other visit
    // starting with the second.
    const prev = Number(localStorage.getItem(STORAGE_VISITS) ?? "0");
    const count = prev + 1;
    localStorage.setItem(STORAGE_VISITS, String(count));
    if (count < 2 || count % 2 !== 0) return;

    // iOS detection — userAgent because feature detection isn't
    // sufficient (iOS Safari doesn't fire beforeinstallprompt).
    const ios =
      /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    setIsIOS(ios);

    if (ios) {
      // No event to wait for — just show the instructions.
      setShow(true);
      return;
    }

    // Chromium browsers: stash the install event when it fires,
    // then reveal our banner. If the event never fires (browser
    // doesn't support PWA install or the site doesn't meet the
    // install criteria for this user yet), we stay silent rather
    // than showing a button that goes nowhere.
    const onBip = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShow(true);
    };
    const onInstalled = () => {
      localStorage.setItem(STORAGE_INSTALLED, "true");
      setShow(false);
    };
    window.addEventListener("beforeinstallprompt", onBip);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBip);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function install() {
    if (!deferredPrompt) return;
    try {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") {
        localStorage.setItem(STORAGE_INSTALLED, "true");
      }
    } catch {
      // Some browsers throw if the event was consumed already;
      // accept the dismissal silently.
    }
    setDeferredPrompt(null);
    setShow(false);
  }

  function dismiss() {
    setShow(false);
  }

  if (!mounted || !show) return null;

  const body = (
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
  );

  return createPortal(body, document.body);
}
