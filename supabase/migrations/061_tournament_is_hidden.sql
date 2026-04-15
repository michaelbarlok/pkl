-- Add is_hidden flag to tournaments so global admins can hide tournaments from public view
ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT false;

-- Index for efficient filtering on public listing pages
CREATE INDEX IF NOT EXISTS tournaments_is_hidden_idx ON tournaments(is_hidden);
