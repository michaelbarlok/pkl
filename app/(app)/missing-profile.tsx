"use client";

import { useSupabase } from "@/components/providers/supabase-provider";
import { useRouter } from "next/navigation";

export function MissingProfile() {
  const { supabase } = useSupabase();
  const router = useRouter();

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="text-center max-w-md">
        <h1 className="text-2xl font-bold text-dark-100">Profile Setup Required</h1>
        <p className="mt-2 text-surface-muted">
          Your account doesn&apos;t have a player profile yet. Please contact an
          administrator to get set up.
        </p>
        <button onClick={handleSignOut} className="btn-primary mt-6">
          Sign out
        </button>
      </div>
    </div>
  );
}
