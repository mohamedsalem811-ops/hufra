-- Fixes a real bug found via integration testing: PATCH /api/potholes/:id/status
-- tried to attach actor_id/note to the status_history row that
-- trg_potholes_status_history auto-inserts, by running an UPDATE against
-- status_history afterwards. But status_history is immutable (UPDATE is
-- forbidden by trg_status_history_no_update), so that UPDATE always throws
-- SQLITE_CONSTRAINT_TRIGGER and the whole request 500s.
--
-- Fix: introduce a small transient staging table that the application
-- populates immediately before changing potholes.status. The status-history
-- insert trigger reads (and clears) that staged value in the SAME trigger
-- body that performs the INSERT, so status_history rows are correctly
-- attributed to their actor from the moment they are created - no UPDATE to
-- status_history is ever required, and its immutability guarantee is
-- preserved exactly as originally intended.

CREATE TABLE IF NOT EXISTS pending_status_change (
  pothole_id INTEGER PRIMARY KEY REFERENCES potholes(id),
  actor_id   INTEGER REFERENCES users(id),
  note       TEXT
);

DROP TRIGGER IF EXISTS trg_potholes_status_history;

CREATE TRIGGER trg_potholes_status_history
AFTER UPDATE OF status ON potholes
WHEN NEW.status IS NOT OLD.status
BEGIN
  INSERT INTO status_history (pothole_id, from_status, to_status, actor_id, note, at)
  VALUES (
    NEW.id,
    OLD.status,
    NEW.status,
    (SELECT actor_id FROM pending_status_change WHERE pothole_id = NEW.id),
    (SELECT note FROM pending_status_change WHERE pothole_id = NEW.id),
    strftime('%Y-%m-%dT%H:%M:%fZ','now')
  );

  DELETE FROM pending_status_change WHERE pothole_id = NEW.id;
END;
