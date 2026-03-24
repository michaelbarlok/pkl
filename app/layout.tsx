import type { Metadata } from "next";
import { SupabaseProvider } from "@/components/providers/supabase-provider";
import { ToastProvider } from "@/components/toast";
import "./globals.css";

// Required: SupabaseProvider needs env vars at render time, so the
// root layout cannot be statically prerendered.
export const dynamic = "force-dynamic";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://pkl.app";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: "PKL",
  description: "Pickleball ladder league platform",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "48x48" },
      { url: "/pkl-icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/pkl-icon-512.png",
  },
  manifest: "/manifest.json",
  openGraph: {
    title: "PKL",
    description: "Pickleball ladder league platform",
    images: [
      {
        url: "/pkl-og.png",
        width: 1200,
        height: 630,
        alt: "PKL – Pickleball ladder league platform",
      },
    ],
    siteName: "PKL",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "PKL",
    description: "Pickleball ladder league platform",
    images: ["/pkl-og.png"],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="font-sans">
        <SupabaseProvider>
          <ToastProvider>{children}</ToastProvider>
        </SupabaseProvider>
      </body>
    </html>
  );
}
