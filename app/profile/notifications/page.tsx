import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

/**
 * GET /profile/notifications
 *
 * Recipient-agnostic deep link used by every transactional email's
 * "Manage email preferences" footer. Looks up the signed-in user's
 * profile id and forwards them to the notifications anchor of their
 * profile edit page. If they aren't signed in (e.g., they opened the
 * email link in a fresh browser session), the login redirect carries
 * them right back here after auth.
 *
 * Lives outside (app) so the (app) layout's auth-not-found redirect
 * can't strip the deep-link target.
 */
export default async function ProfileNotificationsRedirect() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/profile/notifications");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile) {
    redirect("/dashboard");
  }

  redirect(`/players/${profile.id}/edit#notifications`);
}
