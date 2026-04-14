"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { checkAndAwardBadges } from "@/lib/badges";

export async function recalculateBadgesAction(): Promise<{ count: number }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { count: 0 };

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!profile) return { count: 0 };

  const newBadges = await checkAndAwardBadges(profile.id);
  revalidatePath("/badges");
  return { count: newBadges.length };
}
