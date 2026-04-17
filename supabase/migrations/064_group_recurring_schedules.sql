-- Recurring sign-up sheet schedules for ladder groups.
-- When active, the cron job (/api/cron/create-scheduled-sheets) will
-- automatically create a signup_sheet signup_opens_days_before days before
-- each upcoming event matching day_of_week.

CREATE TABLE group_recurring_schedules (
  id                          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id                    UUID        NOT NULL REFERENCES shootout_groups(id) ON DELETE CASCADE,
  day_of_week                 SMALLINT    NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Sun 6=Sat
  event_time                  TIME        NOT NULL,
  location                    TEXT        NOT NULL,
  player_limit                INTEGER     NOT NULL DEFAULT 16,
  signup_opens_days_before    SMALLINT    NOT NULL DEFAULT 7,
  signup_closes_hours_before  SMALLINT    NOT NULL DEFAULT 2,
  withdraw_closes_hours_before SMALLINT,
  allow_member_guests         BOOLEAN     NOT NULL DEFAULT false,
  notes                       TEXT,
  is_active                   BOOLEAN     NOT NULL DEFAULT true,
  created_by                  UUID        REFERENCES profiles(id),
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX group_recurring_schedules_one_per_group
  ON group_recurring_schedules(group_id);

CREATE INDEX group_recurring_schedules_active_idx
  ON group_recurring_schedules(is_active)
  WHERE is_active = true;

ALTER TABLE group_recurring_schedules ENABLE ROW LEVEL SECURITY;

-- Group admins and global admins can manage their group's schedule
CREATE POLICY "group_admins_manage_schedule"
  ON group_recurring_schedules
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM group_memberships gm
      JOIN profiles p ON p.user_id = auth.uid()
      WHERE gm.group_id = group_recurring_schedules.group_id
        AND gm.player_id = p.id
        AND gm.group_role = 'admin'
    )
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Members can read their group's schedule
CREATE POLICY "group_members_read_schedule"
  ON group_recurring_schedules
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM group_memberships gm
      JOIN profiles p ON p.user_id = auth.uid()
      WHERE gm.group_id = group_recurring_schedules.group_id
        AND gm.player_id = p.id
    )
  );
