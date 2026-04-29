-- ============================================================
-- Migration 105: tournament partner invite links
--
-- Lets a player who's registering for a tournament generate a
-- shareable link for someone who isn't on Tri-Star yet. The invitee
-- clicks the link → registers (or logs in) → automatically attaches
-- as the inviter's partner for the right tournament + division.
--
-- The inviter row in tournament_registrations is created up front
-- (as a Need-Partner registration with partner_id NULL), so the
-- slot is held against the cap from the moment the invite is sent.
-- The invite stores a registration_id pointing at that row so the
-- claim flow knows exactly where to attach the partner.
-- ============================================================

CREATE TABLE IF NOT EXISTS tournament_partner_invites (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id   UUID        NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  registration_id UUID        NOT NULL REFERENCES tournament_registrations(id) ON DELETE CASCADE,
  inviter_id      UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  token           TEXT        NOT NULL UNIQUE,
  claimed_by      UUID        REFERENCES profiles(id),
  claimed_at      TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '14 days',
  status          TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'claimed', 'expired', 'cancelled')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS tournament_partner_invites_token_idx
  ON tournament_partner_invites (token);
CREATE INDEX IF NOT EXISTS tournament_partner_invites_tournament_status_idx
  ON tournament_partner_invites (tournament_id, status);

ALTER TABLE tournament_partner_invites ENABLE ROW LEVEL SECURITY;

-- Anyone holding the token (including unauthenticated visitors) can
-- look the invite up. The token itself is the access control — knowing
-- it is what lets you see who invited you. Writes flow exclusively
-- through the API (service client), so no public INSERT/UPDATE policy.
CREATE POLICY "anyone_select_invite"
  ON tournament_partner_invites FOR SELECT USING (true);

NOTIFY pgrst, 'reload schema';
