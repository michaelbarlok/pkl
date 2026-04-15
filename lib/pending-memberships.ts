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
  // Build query for unclaimed pending records matching name OR email
  let query = serviceClient
    .from("pending_group_members")
    .select("*")
    .is("claimed_by", null)
    .or(`name.ilike.${displayName},invite_email.ilike.${email}`);

  if (groupId) query = query.eq("group_id", groupId);

  const { data: pending } = await query;
  if (!pending?.length) return;

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
