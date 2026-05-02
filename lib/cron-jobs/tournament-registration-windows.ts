import { createServiceClient } from "@/lib/supabase/server";

/**
 * Flip tournament status when a registration window boundary passes.
 *
 *   status=draft              + registration_opens_at  <= now
 *     → status=registration_open
 *   status=registration_open  + registration_closes_at <= now
 *     → status=registration_closed
 *
 * Idempotent — running it more or less often only changes how
 * promptly the flip lands. With the consolidated 5-minute cron, a
 * tournament whose opens-at hits at 8:02 will flip by 8:05.
 *
 * Forward-only: never reopens a closed tournament, never reverts an
 * in-progress one. Organizers can override manually.
 */
export async function runTournamentRegistrationWindows(): Promise<{
  opened: number;
  closed: number;
}> {
  const supabase = await createServiceClient();
  const nowIso = new Date().toISOString();

  const { data: opened } = await supabase
    .from("tournaments")
    .update({ status: "registration_open" })
    .eq("status", "draft")
    .not("registration_opens_at", "is", null)
    .lte("registration_opens_at", nowIso)
    .select("id");

  const { data: closed } = await supabase
    .from("tournaments")
    .update({ status: "registration_closed" })
    .eq("status", "registration_open")
    .not("registration_closes_at", "is", null)
    .lte("registration_closes_at", nowIso)
    .select("id");

  return {
    opened: (opened ?? []).length,
    closed: (closed ?? []).length,
  };
}
