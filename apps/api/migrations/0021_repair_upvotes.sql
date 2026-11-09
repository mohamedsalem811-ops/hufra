-- HUFRA / حفرة — Migration 0021: repair "I saw it too" (upvotes) on databases
-- that had migration 0006 applied in an earlier form.
--
-- The production database is older than this repository: its 0006 created the
-- client_report_uuid column and the push tables but not the upvotes, so
-- potholes.upvotes_count, pothole_upvotes and its index were missing there (found
-- by scripts/check-schema.ts). The upvotes_count column moved here from 0006,
-- so a fresh database and production now both get it exactly once. The table
-- and index are created only where missing.

ALTER TABLE potholes ADD COLUMN upvotes_count INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS pothole_upvotes (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  pothole_id    INTEGER NOT NULL REFERENCES potholes(id),
  voter_key     TEXT NOT NULL,
  user_id       INTEGER REFERENCES users(id),
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(pothole_id, voter_key)
);

CREATE INDEX IF NOT EXISTS idx_pothole_upvotes_pothole
  ON pothole_upvotes(pothole_id);

-- The count matches the confirmations already recorded (none where the table is new).
UPDATE potholes
SET upvotes_count = (SELECT COUNT(*) FROM pothole_upvotes u WHERE u.pothole_id = potholes.id);
