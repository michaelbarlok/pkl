import type { Metadata, Viewport } from "next";
import { SupabaseProvider } from "@/components/providers/supabase-provider";
import { ToastProvider } from "@/components/toast";
import { ConfirmProvider } from "@/components/confirm-modal";
import "./globals.css";

// Required: SupabaseProvider needs env vars at render time, so the
// root layout cannot be statically prerendered.
export const dynamic = "force-dynamic";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://tristarpickleball.com";

/**
 * `viewport-fit=cover` lets the page draw under the iOS safe-area insets
 * so the bottom nav can anchor flush to the bottom of the screen and use
 * `env(safe-area-inset-bottom)` to pad itself above the home-indicator.
 * Without this the CSS env() value resolves to 0 and the tab labels
 * squeeze against the indicator, which reads as "nav got cut off".
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0f1115",
};

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: "Tri-Star Pickleball",
  description: "Pickleball ladder league platform",
  icons: {
    icon: [
      { url: "/TriStarPB-icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/TriStarPB-icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/TriStarPB-icon-192.png",
  },
  manifest: "/manifest.json",
  openGraph: {
    title: "Tri-Star Pickleball",
    description: "Pickleball ladder league platform",
    images: [
      {
        url: "/TriStarPB-dark-Photoroom.png",
        alt: "Tri-Star Pickleball – Pickleball ladder league platform",
      },
    ],
    siteName: "Tri-Star Pickleball",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Tri-Star Pickleball",
    description: "Pickleball ladder league platform",
    images: ["/TriStarPB-dark-Photoroom.png"],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Apply saved theme preference before paint so React hydration
            doesn't strip it and the page doesn't flash the wrong colors.
            Stored values: "light" / "dark" / "system" (or missing → system).
            Only "system" / missing falls through to matchMedia so users
            who explicitly chose dark never see light on an OS-light
            device (and vice versa). */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');var useLight=false;if(t==='light'){useLight=true;}else if(t==='dark'){useLight=false;}else{useLight=window.matchMedia('(prefers-color-scheme: light)').matches;}if(useLight){document.documentElement.classList.add('light');}}catch(e){}})()`,
          }}
        />
        {/* Register SW immediately — before React hydrates — so Chrome sees
            the fetch handler early enough to evaluate PWA installability */}
        <script
          dangerouslySetInnerHTML={{
            __html: `if('serviceWorker' in navigator){navigator.serviceWorker.register('/sw.js');}`,
          }}
        />
      </head>
      <body className="font-sans">
        <SupabaseProvider>
          <ToastProvider>
            <ConfirmProvider>{children}</ConfirmProvider>
          </ToastProvider>
        </SupabaseProvider>
      </body>
    </html>
  );
}
