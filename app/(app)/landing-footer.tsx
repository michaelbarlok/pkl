import Link from "next/link";
import { Logo } from "@/components/logo";

export function LandingFooter() {
  return (
    <footer className="border-t border-surface-border bg-dark-950">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-3">
          {/* Brand */}
          <div className="space-y-3">
            <Logo className="h-8 w-auto" />
            <p className="text-sm text-dark-300">
              Your pickleball community, all in one place.
            </p>
          </div>

          {/* Product */}
          <div>
            <h3 className="text-sm font-semibold text-dark-100">Product</h3>
            <ul className="mt-3 space-y-2">
              <li>
                <Link href="/#features" className="text-sm text-dark-200 hover:text-dark-100 transition-colors">
                  Features
                </Link>
              </li>
              <li>
                <Link href="/#signup-sheets" className="text-sm text-dark-200 hover:text-dark-100 transition-colors">
                  Sign-Up Sheets
                </Link>
              </li>
              <li>
                <Link href="/#rankings" className="text-sm text-dark-200 hover:text-dark-100 transition-colors">
                  Rankings
                </Link>
              </li>
              <li>
                <Link href="/#tournaments" className="text-sm text-dark-200 hover:text-dark-100 transition-colors">
                  Tournaments
                </Link>
              </li>
            </ul>
          </div>

          {/* Company */}
          <div>
            <h3 className="text-sm font-semibold text-dark-100">Company</h3>
            <ul className="mt-3 space-y-2">
              <li>
                <Link href="/contact" className="text-sm text-dark-200 hover:text-dark-100 transition-colors">
                  Contact Us
                </Link>
              </li>
              <li>
                <a href="mailto:info@tristarpickleball.com" className="text-sm text-dark-200 hover:text-dark-100 transition-colors">
                  info@tristarpickleball.com
                </a>
              </li>
              <li>
                <Link href="/about" className="text-sm text-dark-200 hover:text-dark-100 transition-colors">
                  About
                </Link>
              </li>
              <li>
                <Link href="/how-it-works" className="text-sm text-dark-200 hover:text-dark-100 transition-colors">
                  How it Works
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="text-sm text-dark-200 hover:text-dark-100 transition-colors">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/terms" className="text-sm text-dark-200 hover:text-dark-100 transition-colors">
                  Terms of Service
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-10 border-t border-surface-border/50 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-dark-400">
            &copy; {new Date().getFullYear()} Tri-Star Pickleball. All rights reserved.
          </p>
          <div className="flex items-center gap-4">
            <Link href="/about" className="text-xs text-dark-400 hover:text-dark-200 transition-colors">
              About
            </Link>
            <Link href="/privacy" className="text-xs text-dark-400 hover:text-dark-200 transition-colors">
              Privacy Policy
            </Link>
            <Link href="/terms" className="text-xs text-dark-400 hover:text-dark-200 transition-colors">
              Terms of Service
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
