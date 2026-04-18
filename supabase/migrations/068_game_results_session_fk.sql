-- Add FK from game_results.session_id → shootout_sessions(id) ON DELETE CASCADE.
-- Previously session_id was an unprotected UUID column, requiring explicit deletes.
-- With CASCADE, deleting a session automatically cleans up its game_results rows.
ALTER TABLE game_results
  ADD CONSTRAINT game_results_session_id_fkey
  FOREIGN KEY (session_id)
  REFERENCES shootout_sessions(id)
  ON DELETE CASCADE;
