-- Plan 8.2: the legal information (legal name, address, retention periods...)
-- is published in numbered versions. A material change asks users to accept
-- the new version; the version each user accepted is recorded.
CREATE TABLE IF NOT EXISTS legal_versions (
  version      INTEGER PRIMARY KEY,
  info_json    TEXT    NOT NULL,
  material     INTEGER NOT NULL DEFAULT 0 CHECK (material IN (0, 1)),
  published_by INTEGER REFERENCES users(id),
  published_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

ALTER TABLE users ADD COLUMN legal_version_accepted INTEGER;
ALTER TABLE users ADD COLUMN legal_accepted_at TEXT;
