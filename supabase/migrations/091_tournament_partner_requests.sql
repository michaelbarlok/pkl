-- Partner matchmaking for doubles tournaments.
--
-- A "Need Partner" entry is just a registration row with partner_id IS NULL
-- in a doubles tournament. Another player seeing the need-partner badge can
-- request to partner, which writes a row here. The target accepts or
-- declines; on accept we link partner_id both ways and create the requester's
-- registration if they didn't already have one.
CREATE TABLE IF NOT EXISTS tournament_partner_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  division TEXT NOT NULL,
  requester_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  target_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','declined','cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at TIMESTAMPTZ,
  CONSTRAINT tpr_no_self CHECK (requester_id <> target_id),
  CONSTRAINT tpr_unique_pending UNIQUE (tournament_id, requester_id, target_id, status)
);

CREATE INDEX IF NOT EXISTS tpr_target_status_idx
  ON tournament_partner_requests (target_id, status)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS tpr_requester_status_idx
  ON tournament_partner_requests (requester_id, status)
  WHERE status = 'pending';

ALTER TABLE tournament_partner_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "View own partner requests" ON tournament_partner_requests;
CREATE POLICY "View own partner requests"
  ON tournament_partner_requests FOR SELECT USING (
    requester_id = (SELECT id FROM profiles WHERE user_id = auth.uid())
    OR target_id = (SELECT id FROM profiles WHERE user_id = auth.uid())
    OR is_tournament_organizer(tournament_id)
  );

DROP POLICY IF EXISTS "Requester inserts partner request" ON tournament_partner_requests;
CREATE POLICY "Requester inserts partner request"
  ON tournament_partner_requests FOR INSERT WITH CHECK (
    requester_id = (SELECT id FROM profiles WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Respond to partner request" ON tournament_partner_requests;
CREATE POLICY "Respond to partner request"
  ON tournament_partner_requests FOR UPDATE USING (
    target_id = (SELECT id FROM profiles WHERE user_id = auth.uid())
    OR requester_id = (SELECT id FROM profiles WHERE user_id = auth.uid())
    OR is_tournament_organizer(tournament_id)
  );
