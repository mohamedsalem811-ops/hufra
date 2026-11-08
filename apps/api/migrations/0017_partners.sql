-- Plan 8.2: partners shown on the website, in the app and on the campaigns
-- they fund. Hiding never deletes; deleting is soft (the audit log keeps it).
CREATE TABLE IF NOT EXISTS partners (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  name_ar        TEXT    NOT NULL,
  name_en        TEXT    NOT NULL,
  description_ar TEXT    NOT NULL DEFAULT '',
  description_en TEXT    NOT NULL DEFAULT '',
  website        TEXT    NOT NULL DEFAULT '',
  kind           TEXT    NOT NULL DEFAULT 'repair_sponsor' CHECK (kind IN ('repair_sponsor', 'government', 'tech', 'media')),
  logo_key       TEXT,
  starts_on      TEXT,
  ends_on        TEXT,
  show_home      INTEGER NOT NULL DEFAULT 1 CHECK (show_home IN (0, 1)),
  show_about     INTEGER NOT NULL DEFAULT 1 CHECK (show_about IN (0, 1)),
  show_app       INTEGER NOT NULL DEFAULT 1 CHECK (show_app IN (0, 1)),
  show_campaigns INTEGER NOT NULL DEFAULT 1 CHECK (show_campaigns IN (0, 1)),
  featured       INTEGER NOT NULL DEFAULT 0 CHECK (featured IN (0, 1)),
  visible        INTEGER NOT NULL DEFAULT 1 CHECK (visible IN (0, 1)),
  sort_order     INTEGER NOT NULL DEFAULT 0,
  created_by     INTEGER REFERENCES users(id),
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at     TEXT
);
CREATE INDEX IF NOT EXISTS idx_partners_order ON partners(deleted_at, sort_order);

-- "Supported by": the partner who funds a repair campaign.
ALTER TABLE campaigns ADD COLUMN partner_id INTEGER REFERENCES partners(id);
