-- Enforce that only one non-complete session can exist per sign-up sheet.
-- A new session can only be created once the previous one reaches 'session_complete'.

-- First, clean up any existing duplicate active sessions per sheet.
-- Keep the most recently created one and mark older ones as complete.
UPDATE shootout_sessions
SET status = 'session_complete'
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY sheet_id ORDER BY created_at DESC) AS rn
    FROM shootout_sessions
    WHERE status <> 'session_complete'
  ) sub
  WHERE rn > 1
);

CREATE UNIQUE INDEX idx_one_active_session_per_sheet
  ON shootout_sessions (sheet_id)
  WHERE status <> 'session_complete';
