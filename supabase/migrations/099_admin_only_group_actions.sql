-- ============================================================
-- Migration 099: Lock down group admin actions at the RLS layer
--
-- App-layer auth checks already exist for these actions, but the
-- RLS policies were either too loose (any group member could start
-- a free-play session) or too tight (only site-level admins could
-- update shootout_groups, which silently 0-rowed when a group
-- admin saved settings via the RLS-aware client).
--
-- This migration aligns RLS with the app-layer intent:
--   - free_play_sessions INSERT  → group admins only
--   - shootout_groups UPDATE     → group admins only (in addition
--                                  to existing site-admin "manage")
-- ============================================================

-- ── free_play_sessions: only group admins can start ──────────
DROP POLICY IF EXISTS "Group members can create sessions" ON free_play_sessions;

CREATE POLICY "Group admins can create sessions"
  ON free_play_sessions FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM group_memberships gm
      JOIN profiles p ON p.id = gm.player_id
      WHERE gm.group_id = free_play_sessions.group_id
        AND p.user_id = auth.uid()
        AND gm.group_role = 'admin'
    )
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- ── shootout_groups: group admins can update their own group ─
-- The existing "Admins can manage groups" policy (003) only matches
-- site-level admins. Without this companion policy, a group admin
-- saving settings (e.g. rolling_sessions_count) would silently
-- update zero rows because RLS rejects the row even though the API
-- already gated the call with isGroupAdmin().
CREATE POLICY "Group admins can update their group"
  ON shootout_groups FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM group_memberships gm
      JOIN profiles p ON p.id = gm.player_id
      WHERE gm.group_id = shootout_groups.id
        AND p.user_id = auth.uid()
        AND gm.group_role = 'admin'
    )
  );

NOTIFY pgrst, 'reload schema';
