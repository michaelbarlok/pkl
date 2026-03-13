import type { Metadata } from "next";
import { SupabaseProvider } from "@/components/providers/supabase-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "PKL",
  description: "Pickleball ladder league platform",
  icons: {
    icon: "/pb-logo.webp",
    apple: "/pkl-icon-512.png",
  },
  manifest: "/manifest.json",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="font-sans">
        <SupabaseProvider>{children}</SupabaseProvider>
      </body>
    </html>
  );
}
