import type { Metadata } from "next";
import { SupabaseProvider } from "@/components/providers/supabase-provider";
import { ToastProvider } from "@/components/toast";
import { ConfirmProvider } from "@/components/confirm-modal";
import "./globals.css";

// Required: SupabaseProvider needs env vars at render time, so the
// root layout cannot be statically prerendered.
export const dynamic = "force-dynamic";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://pkl.app";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: "Tri-Star Pickleball",
  description: "Pickleball ladder league platform",
  icons: {
    icon: [
      { url: "/PKLBall-AppIcon.png", sizes: "192x192", type: "image/png" },
      { url: "/PKLBall-AppIcon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/PKLBall-AppIcon.png",
  },
  manifest: "/manifest.json",
  openGraph: {
    title: "Tri-Star Pickleball",
    description: "Pickleball ladder league platform",
    images: [
      {
        url: "/PKLBall.png",
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
    images: ["/PKLBall.png"],
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
        {/* Apply saved theme before paint so React hydration doesn't strip it */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');if(t==='light')document.documentElement.classList.add('light');}catch(e){}})()`,
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
