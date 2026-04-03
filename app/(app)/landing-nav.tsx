"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

export function LandingNav() {
  const [menuOpen, setMenuOpen] = useState(false);

  // Close menu on escape key
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  // Prevent body scroll when menu is open
  useEffect(() => {
    if (menuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [menuOpen]);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-dark-950/90 backdrop-blur-md border-b border-surface-border/50">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            <img src="/PKLBall.png" alt="PKL Ball" className="h-8 w-auto" />
          </Link>

          {/* Desktop links */}
          <div className="hidden md:flex items-center gap-8">
            <Link href="/#features" className="text-sm font-medium text-dark-200 hover:text-dark-100 transition-colors">
              Features
            </Link>
            <Link href="/contact" className="text-sm font-medium text-dark-200 hover:text-dark-100 transition-colors">
              Contact
            </Link>
          </div>

          {/* Desktop CTA */}
          <div className="hidden md:flex items-center gap-3">
            <Link href="/login" className="btn-secondary px-4 py-2 text-sm">
              Log In
            </Link>
            <Link href="/register" className="btn-primary px-4 py-2 text-sm">
              Get Started
            </Link>
          </div>

          {/* Mobile hamburger */}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="md:hidden flex items-center justify-center h-10 w-10 rounded-lg text-dark-200 hover:text-dark-100 hover:bg-surface-raised transition-colors"
            aria-label="Toggle menu"
          >
            {menuOpen ? (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 top-16 bg-dark-950/60 md:hidden"
            onClick={() => setMenuOpen(false)}
          />
          {/* Panel */}
          <div className="absolute top-16 left-0 right-0 bg-dark-950 border-b border-surface-border md:hidden">
            <div className="px-4 py-4 space-y-1">
              <Link
                href="/#features"
                onClick={() => setMenuOpen(false)}
                className="block rounded-lg px-3 py-2.5 text-sm font-medium text-dark-200 hover:text-dark-100 hover:bg-surface-raised transition-colors"
              >
                Features
              </Link>
              <Link
                href="/contact"
                onClick={() => setMenuOpen(false)}
                className="block rounded-lg px-3 py-2.5 text-sm font-medium text-dark-200 hover:text-dark-100 hover:bg-surface-raised transition-colors"
              >
                Contact
              </Link>
            </div>
            <div className="border-t border-surface-border px-4 py-4 flex flex-col gap-2">
              <Link
                href="/login"
                onClick={() => setMenuOpen(false)}
                className="btn-secondary px-4 py-2.5 text-sm text-center"
              >
                Log In
              </Link>
              <Link
                href="/register"
                onClick={() => setMenuOpen(false)}
                className="btn-primary px-4 py-2.5 text-sm text-center"
              >
                Get Started
              </Link>
            </div>
          </div>
        </>
      )}
    </nav>
  );
}
