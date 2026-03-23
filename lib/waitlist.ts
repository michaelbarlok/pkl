import { createServiceClient } from "@/lib/supabase/server";
import { notify } from "@/lib/notify";
import { formatDate } from "@/lib/utils";

/**
 * After a confirmed player is removed from a sheet, promote the
 * highest-priority waitlisted player and reorder the remaining waitlist.
 *
 * Uses the atomic promote_next_waitlist_player() RPC which locks the sheet
 * row to prevent race conditions when multiple withdrawals happen concurrently.
 *
 * Returns the promoted player's ID, or null if no one was promoted.
 */
export async function promoteNextWaitlistPlayer(sheetId: string): Promise<string | null> {
  const admin = await createServiceClient();

  const { data: result, error: rpcError } = await admin.rpc(
    "promote_next_waitlist_player",
    { p_sheet_id: sheetId }
  );

  if (rpcError) {
    console.error("promote_next_waitlist_player RPC error:", rpcError);
    // Fallback to non-atomic promotion if RPC not deployed yet
    return fallbackPromote(admin, sheetId);
  }

  const { promoted, player_id } = result as {
    promoted: boolean;
    player_id?: string;
  };

  if (!promoted || !player_id) return null;

  // Notify the promoted player (non-blocking)
  const { data: sheet } = await admin
    .from("signup_sheets")
    .select("event_date, group:shootout_groups(name)")
    .eq("id", sheetId)
    .single();

  const groupName = (sheet as { group?: { name?: string } })?.group?.name ?? "the event";
  const eventDate = sheet?.event_date ?? "";

  notify({
    profileId: player_id,
    type: "waitlist_promoted",
    title: "You're in!",
    body: `A spot opened up for ${groupName} on ${eventDate ? formatDate(eventDate) : "the upcoming date"}. You've been moved from the waitlist to the confirmed list.`,
    link: `/sheets/${sheetId}`,
    emailTemplate: "WaitlistPromoted",
    emailData: { groupName, eventDate, sheetId },
  }).catch(() => {
    // notification failure is non-blocking
  });

  return player_id;
}

/**
 * Fallback promotion logic if the RPC hasn't been deployed yet.
 */
async function fallbackPromote(
  admin: Awaited<ReturnType<typeof createServiceClient>>,
  sheetId: string
): Promise<string | null> {
  const PRIORITY_ORDER: Record<string, number> = { high: 2, normal: 1, low: 0 };

  const { data: waitlisted } = await admin
    .from("registrations")
    .select("id, player_id, waitlist_position, priority")
    .eq("sheet_id", sheetId)
    .eq("status", "waitlist")
    .order("waitlist_position", { ascending: true });

  const sorted = (waitlisted ?? []).sort((a, b) => {
    const aPri = PRIORITY_ORDER[a.priority ?? "normal"] ?? 1;
    const bPri = PRIORITY_ORDER[b.priority ?? "normal"] ?? 1;
    if (aPri !== bPri) return bPri - aPri;
    return (a.waitlist_position ?? 999) - (b.waitlist_position ?? 999);
  });

  const next = sorted[0] ?? null;
  if (!next) return null;

  await admin
    .from("registrations")
    .update({ status: "confirmed", waitlist_position: null })
    .eq("id", next.id);

  // Reorder remaining
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

  return next.player_id;
}
