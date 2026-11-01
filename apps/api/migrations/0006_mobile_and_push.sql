-- HUFRA / حفرة — Migration 0006: Mobile + Offline Sync, Push Notifications, Upvotes & Default Super Admin

ALTER TABLE potholes ADD COLUMN client_report_uuid TEXT;
ALTER TABLE potholes ADD COLUMN upvotes_count INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS idx_potholes_client_uuid
  ON potholes(client_report_uuid)
  WHERE client_report_uuid IS NOT NULL;

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

CREATE TABLE IF NOT EXISTS device_push_tokens (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL REFERENCES users(id),
  platform      TEXT NOT NULL CHECK (platform IN ('android','ios','web')),
  token         TEXT NOT NULL UNIQUE,
  endpoint_json TEXT,
  locale        TEXT NOT NULL DEFAULT 'ar' CHECK (locale IN ('ar','en')),
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_push_tokens_user
  ON device_push_tokens(user_id, active);

-- Default Super Admin account (100,000 PBKDF2 iterations for Cloudflare Workers WebCrypto):
--   Email:    admin@hufra.ly
--   Password: Hufra@Admin2026!
--   Role:     super_admin
INSERT INTO users (email, password_hash, role, code, locale, display_name, consent_at)
VALUES (
  'admin@hufra.ly',
  'pbkdf2$100000$MDEyMzQ1Njc4OWFiY2RlZg==$lPahV731SKJt5rMZA80HBOQmAH8lO/34xSztRjUiKL0=',
  'super_admin',
  '',
  'ar',
  'إدارة حفرة',
  strftime('%Y-%m-%dT%H:%M:%fZ','now')
)
ON CONFLICT(email) DO UPDATE SET
  password_hash = excluded.password_hash,
  role = 'super_admin',
  deleted_at = NULL;
