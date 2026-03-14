-- ============================================================
-- Migration 020: Forum scoped to groups + @mentions + polls
-- ============================================================

-- 1. Add group_id to forum_threads (required, ties threads to a group)
ALTER TABLE forum_threads
  ADD COLUMN group_id UUID REFERENCES shootout_groups(id) ON DELETE CASCADE;

-- Backfill: assign orphan threads to the first active group (if any exist)
UPDATE forum_threads
SET group_id = (SELECT id FROM shootout_groups WHERE is_active = true ORDER BY created_at LIMIT 1)
WHERE group_id IS NULL;

-- Now make it NOT NULL
ALTER TABLE forum_threads
  ALTER COLUMN group_id SET NOT NULL;

CREATE INDEX idx_forum_threads_group ON forum_threads (group_id, created_at DESC);

-- Update RLS: only group members can view threads in their group
DROP POLICY IF EXISTS "Anyone can view non-deleted threads" ON forum_threads;
CREATE POLICY "Group members can view non-deleted threads"
  ON forum_threads FOR SELECT USING (
    deleted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM group_memberships gm
      JOIN profiles p ON p.id = gm.player_id
      WHERE gm.group_id = forum_threads.group_id
        AND p.user_id = auth.uid()
    )
  );

-- Update insert policy to require group membership
DROP POLICY IF EXISTS "Authenticated users can create threads" ON forum_threads;
CREATE POLICY "Group members can create threads"
  ON forum_threads FOR INSERT WITH CHECK (
    author_id = (SELECT id FROM profiles WHERE user_id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM group_memberships gm
      JOIN profiles p ON p.id = gm.player_id
      WHERE gm.group_id = forum_threads.group_id
        AND p.user_id = auth.uid()
    )
  );

-- Update reply SELECT policy: only if user is member of the thread's group
DROP POLICY IF EXISTS "Anyone can view replies" ON forum_replies;
CREATE POLICY "Group members can view replies"
  ON forum_replies FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM forum_threads ft
      JOIN group_memberships gm ON gm.group_id = ft.group_id
      JOIN profiles p ON p.id = gm.player_id
      WHERE ft.id = forum_replies.thread_id
        AND p.user_id = auth.uid()
    )
  );

-- Update reply INSERT policy
DROP POLICY IF EXISTS "Authenticated users can create replies" ON forum_replies;
CREATE POLICY "Group members can create replies"
  ON forum_replies FOR INSERT WITH CHECK (
    author_id = (SELECT id FROM profiles WHERE user_id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM forum_threads ft
      JOIN group_memberships gm ON gm.group_id = ft.group_id
      JOIN profiles p ON p.id = gm.player_id
      WHERE ft.id = forum_replies.thread_id
        AND p.user_id = auth.uid()
    )
  );

-- ============================================================
-- 2. Polls on forum threads
-- ============================================================

CREATE TABLE forum_polls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID REFERENCES forum_threads(id) ON DELETE CASCADE NOT NULL UNIQUE,
  question TEXT NOT NULL CHECK (char_length(question) <= 500),
  anonymous BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE forum_poll_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id UUID REFERENCES forum_polls(id) ON DELETE CASCADE NOT NULL,
  label TEXT NOT NULL CHECK (char_length(label) <= 200),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE forum_poll_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id UUID REFERENCES forum_polls(id) ON DELETE CASCADE NOT NULL,
  option_id UUID REFERENCES forum_poll_options(id) ON DELETE CASCADE NOT NULL,
  voter_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (poll_id, voter_id) -- one vote per poll per user
);

-- RLS for polls
ALTER TABLE forum_polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum_poll_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE forum_poll_votes ENABLE ROW LEVEL SECURITY;

-- Polls: visible to group members (via thread)
CREATE POLICY "Group members can view polls"
  ON forum_polls FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM forum_threads ft
      JOIN group_memberships gm ON gm.group_id = ft.group_id
      JOIN profiles p ON p.id = gm.player_id
      WHERE ft.id = forum_polls.thread_id
        AND p.user_id = auth.uid()
    )
  );

CREATE POLICY "Thread author can create poll"
  ON forum_polls FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM forum_threads ft
      WHERE ft.id = forum_polls.thread_id
        AND ft.author_id = (SELECT id FROM profiles WHERE user_id = auth.uid())
    )
  );

-- Poll options: visible to group members
CREATE POLICY "Group members can view poll options"
  ON forum_poll_options FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM forum_polls fp
      JOIN forum_threads ft ON ft.id = fp.thread_id
      JOIN group_memberships gm ON gm.group_id = ft.group_id
      JOIN profiles p ON p.id = gm.player_id
      WHERE fp.id = forum_poll_options.poll_id
        AND p.user_id = auth.uid()
    )
  );

CREATE POLICY "Thread author can create poll options"
  ON forum_poll_options FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM forum_polls fp
      JOIN forum_threads ft ON ft.id = fp.thread_id
      WHERE fp.id = forum_poll_options.poll_id
        AND ft.author_id = (SELECT id FROM profiles WHERE user_id = auth.uid())
    )
  );

-- Votes: visible based on anonymous setting
CREATE POLICY "View votes"
  ON forum_poll_votes FOR SELECT USING (
    -- Always allow viewing vote counts; voter identity checked at app level
    EXISTS (
      SELECT 1 FROM forum_polls fp
      JOIN forum_threads ft ON ft.id = fp.thread_id
      JOIN group_memberships gm ON gm.group_id = ft.group_id
      JOIN profiles p ON p.id = gm.player_id
      WHERE fp.id = forum_poll_votes.poll_id
        AND p.user_id = auth.uid()
    )
  );

CREATE POLICY "Group members can vote"
  ON forum_poll_votes FOR INSERT WITH CHECK (
    voter_id = (SELECT id FROM profiles WHERE user_id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM forum_polls fp
      JOIN forum_threads ft ON ft.id = fp.thread_id
      JOIN group_memberships gm ON gm.group_id = ft.group_id
      JOIN profiles p ON p.id = gm.player_id
      WHERE fp.id = forum_poll_votes.poll_id
        AND p.user_id = auth.uid()
    )
  );

CREATE POLICY "Voters can delete own vote"
  ON forum_poll_votes FOR DELETE USING (
    voter_id = (SELECT id FROM profiles WHERE user_id = auth.uid())
  );

-- Admin policies for polls
CREATE POLICY "Admins manage polls"
  ON forum_polls FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins manage poll options"
  ON forum_poll_options FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins manage poll votes"
  ON forum_poll_votes FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role = 'admin')
  );
