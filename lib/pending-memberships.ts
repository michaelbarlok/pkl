/**
 * Auto-claim pending group member records.
 *
 * Called after a profile is created (signup) or when a player joins a group.
 * Matches pending records by display_name (case-insensitive) OR invite_email,
 * then creates/updates group_memberships with the stored stats.
 *
 * @param serviceClient  Service-role Supabase client (bypasses RLS)
 * @param profileId      The newly-created or joining profile's id
 * @param displayName    The player's current display_name
 * @param email          The player's email address
 * @param groupId        If provided, only claim pending records for this group
 */
export async function claimPendingMemberships(
  serviceClient: any,
  profileId: string,
  displayName: string,
  email: string,
  groupId?: string
): Promise<void> {
  // Two parameterized queries (one by name, one by email), then dedupe
  // in JS. The previous implementation built a single `.or()` filter by
  // string-interpolating the name + email into the PostgREST query —
  // which broke on legitimate display names containing a comma
  // ("Smith, Jane") because commas are the OR separator in that syntax.
  // Going through the typed `.ilike()` method escapes values properly
  // and doesn't care about special characters in the input.
  const byId = new Map<string, Record<string, unknown>>();

  const nameQuery = (() => {
    const q = serviceClient
      .from("pending_group_members")
      .select("*")
      .is("claimed_by", null)
      .ilike("name", displayName);
    return groupId ? q.eq("group_id", groupId) : q;
  })();
  const { data: byName } = await nameQuery;
  for (const row of byName ?? []) byId.set(row.id, row);

  if (email) {
    const emailQuery = (() => {
      const q = serviceClient
        .from("pending_group_members")
        .select("*")
        .is("claimed_by", null)
        .ilike("invite_email", email);
      return groupId ? q.eq("group_id", groupId) : q;
    })();
    const { data: byEmail } = await emailQuery;
    for (const row of byEmail ?? []) byId.set(row.id, row);
  }

  const pending = Array.from(byId.values());
  if (pending.length === 0) return;

  const now = new Date().toISOString();

  for (const record of pending) {
    // Check if already a member of this group
    const { data: existing } = await serviceClient
      .from("group_memberships")
      .select("player_id")
      .eq("group_id", record.group_id)
      .eq("player_id", profileId)
      .maybeSingle();

    if (existing) {
      // Already a member — overwrite with pending stats (preserves historical data)
      const update: Record<string, unknown> = {};
      if (record.step != null)           update.current_step    = record.step;
      if (record.win_pct != null)        update.win_pct         = record.win_pct;
      if (record.total_sessions != null) update.total_sessions  = record.total_sessions;
      if (record.last_played_at)         update.last_played_at  = record.last_played_at;
      if (record.joined_at)              update.joined_at       = record.joined_at;

      if (Object.keys(update).length > 0) {
        await serviceClient
          .from("group_memberships")
          .update(update)
          .eq("group_id", record.group_id)
          .eq("player_id", profileId);
      }
    } else {
      // Not yet a member — auto-join with pending stats
      const { data: prefs } = await serviceClient
        .from("group_preferences")
        .select("new_player_start_step")
        .eq("group_id", record.group_id)
        .maybeSingle();

      const insertPayload: Record<string, unknown> = {
        group_id:       record.group_id,
        player_id:      profileId,
        current_step:   record.step ?? prefs?.new_player_start_step ?? 5,
        win_pct:        record.win_pct ?? 0,
        total_sessions: record.total_sessions ?? 0,
      };
      if (record.last_played_at) insertPayload.last_played_at = record.last_played_at;
      if (record.joined_at)      insertPayload.joined_at      = record.joined_at;

      await serviceClient.from("group_memberships").insert(insertPayload);
    }

    // Apply skill_level to profile if present
    if (record.skill_level != null) {
      await serviceClient
        .from("profiles")
        .update({ skill_level: record.skill_level })
        .eq("id", profileId);
    }

    // Mark as claimed
    await serviceClient
      .from("pending_group_members")
      .update({ claimed_by: profileId, claimed_at: now })
      .eq("id", record.id);
  }
}
