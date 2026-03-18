import { createServiceClient } from "@/lib/supabase/server";
import { notify } from "@/lib/notify";
import { formatDate, PRIORITY_ORDER } from "@/lib/utils";

/**
 * After a confirmed player is removed from a sheet, promote the
 * highest-priority waitlisted player and reorder the remaining waitlist.
 *
 * Returns the promoted player's ID, or null if no one was promoted.
 */
export async function promoteNextWaitlistPlayer(sheetId: string): Promise<string | null> {
  const admin = await createServiceClient();

  const { data: waitlisted } = await admin
    .from("registrations")
    .select("id, player_id, waitlist_position, priority")
    .eq("sheet_id", sheetId)
    .eq("status", "waitlist")
    .order("waitlist_position", { ascending: true });

  const sorted = (waitlisted ?? []).sort((a, b) => {
    const aPri = PRIORITY_ORDER[a.priority ?? "normal"] ?? 1;
    const bPri = PRIORITY_ORDER[b.priority ?? "normal"] ?? 1;
    if (aPri !== bPri) return aPri - bPri;
    return (a.waitlist_position ?? 999) - (b.waitlist_position ?? 999);
  });

  const next = sorted[0] ?? null;
  if (!next) return null;

  // Promote to confirmed
  await admin
    .from("registrations")
    .update({ status: "confirmed", waitlist_position: null })
    .eq("id", next.id);

  // Reorder remaining waitlist
  const { data: remaining } = await admin
    .from("registrations")
    .select("id, waitlist_position")
    .eq("sheet_id", sheetId)
    .eq("status", "waitlist")
    .order("waitlist_position", { ascending: true });

  if (remaining) {
    for (let i = 0; i < remaining.length; i++) {
      await admin
        .from("registrations")
        .update({ waitlist_position: i + 1 })
        .eq("id", remaining[i].id);
    }
  }

  // Notify the promoted player
  const { data: sheet } = await admin
    .from("signup_sheets")
    .select("event_date, group:shootout_groups(name)")
    .eq("id", sheetId)
    .single();

  const groupName = (sheet as { group?: { name?: string } })?.group?.name ?? "the event";
  const eventDate = sheet?.event_date ?? "";

  notify({
    profileId: next.player_id,
    type: "waitlist_promoted",
    title: "You're in!",
    body: `A spot opened up for ${groupName} on ${eventDate ? formatDate(eventDate) : "the upcoming date"}. You've been moved from the waitlist to the confirmed list.`,
    link: `/sheets/${sheetId}`,
    emailTemplate: "WaitlistPromoted",
    emailData: { groupName, eventDate, sheetId },
  }).catch(() => {
    // notification failure is non-blocking
  });

  return next.player_id;
}
