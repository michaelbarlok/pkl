-- Add unique constraint on email so upsert onConflict: "email" works correctly
ALTER TABLE pending_invites ADD CONSTRAINT pending_invites_email_unique UNIQUE (email);
