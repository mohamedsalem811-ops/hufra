-- HUFRA / حفرة initial schema
-- Target: Cloudflare D1 (SQLite dialect)
-- NOTE (assumption): SQLite/D1 has no native row-level security (RLS) or PostGIS
-- geospatial types like Postgres. This schema stores plain lat/lng REAL columns
-- with a supporting index, and the application layer (src/lib/authz.ts) enforces
-- row-level access rules identical in intent to Postgres RLS on every query.
-- Geospatial "near me" queries use a bounding-box pre-filter on lat/lng followed
-- by exact Haversine distance calculation in application code (src/lib/geo.ts).

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin','super_admin')),
  code          TEXT NOT NULL UNIQUE,
  locale        TEXT NOT NULL DEFAULT 'ar' CHECK (locale IN ('ar','en')),
  totp_secret   TEXT,
  totp_enabled  INTEGER NOT NULL DEFAULT 0,
  display_name  TEXT,
  consent_at    TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at    TEXT
);

CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON users(deleted_at);

-- Sequence-like helper table to generate LBY{n}-{year} codes without relying
-- on user.id (which could be affected by soft deletes/imports in the future).
CREATE TABLE IF NOT EXISTS user_code_seq (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  next_value INTEGER NOT NULL DEFAULT 1
);
INSERT OR IGNORE INTO user_code_seq (id, next_value) VALUES (1, 1);

-- ---------------------------------------------------------------------------
-- refresh_tokens (session management for JWT rotation)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  token_hash  TEXT NOT NULL UNIQUE,
  user_agent  TEXT,
  ip_hash     TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  expires_at  TEXT NOT NULL,
  revoked_at  TEXT
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);

-- ---------------------------------------------------------------------------
-- regions (Greater Tripoli areas)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS regions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  slug        TEXT NOT NULL UNIQUE,
  name_ar     TEXT NOT NULL,
  name_en     TEXT NOT NULL,
  city        TEXT NOT NULL DEFAULT 'Greater Tripoli',
  center_lat  REAL NOT NULL,
  center_lng  REAL NOT NULL,
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_regions_active ON regions(active);

-- ---------------------------------------------------------------------------
-- potholes
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS potholes (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  region_id      INTEGER NOT NULL REFERENCES regions(id),
  reporter_id    INTEGER REFERENCES users(id),
  reporter_contact TEXT,
  lat            REAL NOT NULL,
  lng            REAL NOT NULL,
  length_cm      REAL,
  width_cm       REAL,
  depth_cm       REAL,
  severity       TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('minor','medium','severe')),
  status         TEXT NOT NULL DEFAULT 'reported' CHECK (status IN ('reported','verified','under_repair','fixed')),
  description_ar TEXT,
  description_en TEXT,
  street_ar      TEXT,
  street_en      TEXT,
  view_count     INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  verified_at    TEXT,
  under_repair_at TEXT,
  fixed_at       TEXT,
  deleted_at     TEXT
);

CREATE INDEX IF NOT EXISTS idx_potholes_lat ON potholes(lat);
CREATE INDEX IF NOT EXISTS idx_potholes_lng ON potholes(lng);
CREATE INDEX IF NOT EXISTS idx_potholes_region ON potholes(region_id);
CREATE INDEX IF NOT EXISTS idx_potholes_status ON potholes(status);
CREATE INDEX IF NOT EXISTS idx_potholes_reporter ON potholes(reporter_id);
CREATE INDEX IF NOT EXISTS idx_potholes_created_at ON potholes(created_at);
CREATE INDEX IF NOT EXISTS idx_potholes_deleted_at ON potholes(deleted_at);
-- Composite index accelerates bounding-box "near me" pre-filtering.
CREATE INDEX IF NOT EXISTS idx_potholes_geo ON potholes(lat, lng);

-- ---------------------------------------------------------------------------
-- pothole_photos
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pothole_photos (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  pothole_id  INTEGER NOT NULL REFERENCES potholes(id),
  r2_key      TEXT NOT NULL,
  thumb_key   TEXT NOT NULL,
  stage       TEXT NOT NULL DEFAULT 'report' CHECK (stage IN ('report','before','during','after')),
  width_px    INTEGER,
  height_px   INTEGER,
  size_bytes  INTEGER,
  exif_json   TEXT,
  uploaded_by INTEGER REFERENCES users(id),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at  TEXT
);

CREATE INDEX IF NOT EXISTS idx_photos_pothole ON pothole_photos(pothole_id);
CREATE INDEX IF NOT EXISTS idx_photos_stage ON pothole_photos(stage);

-- ---------------------------------------------------------------------------
-- status_history
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS status_history (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  pothole_id   INTEGER NOT NULL REFERENCES potholes(id),
  from_status  TEXT,
  to_status    TEXT NOT NULL,
  actor_id     INTEGER REFERENCES users(id),
  note         TEXT,
  at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_status_history_pothole ON status_history(pothole_id);

-- ---------------------------------------------------------------------------
-- duplicate_flags (manual review helper, no AI - pure geospatial distance)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS duplicate_flags (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  pothole_id     INTEGER NOT NULL REFERENCES potholes(id),
  duplicate_of_id INTEGER NOT NULL REFERENCES potholes(id),
  distance_m     REAL NOT NULL,
  review_status  TEXT NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending','confirmed','rejected')),
  reviewed_by    INTEGER REFERENCES users(id),
  reviewed_at    TEXT,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_dup_pothole ON duplicate_flags(pothole_id);
CREATE INDEX IF NOT EXISTS idx_dup_status ON duplicate_flags(review_status);

-- ---------------------------------------------------------------------------
-- notifications (in-dashboard bell/badge, e.g. new report -> admins)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  target_role  TEXT CHECK (target_role IN ('admin','super_admin')),
  target_user_id INTEGER REFERENCES users(id),
  type         TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  read_at      TEXT,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_notifications_target_role ON notifications(target_role, read_at);
CREATE INDEX IF NOT EXISTS idx_notifications_target_user ON notifications(target_user_id, read_at);

-- ---------------------------------------------------------------------------
-- audit_logs (immutable - enforced by trigger in 0003_triggers.sql)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id    INTEGER REFERENCES users(id),
  action      TEXT NOT NULL,
  entity      TEXT NOT NULL,
  entity_id   INTEGER,
  before_json TEXT,
  after_json  TEXT,
  ip_hash     TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_logs(actor_id);

-- ---------------------------------------------------------------------------
-- rate_limit_events (fallback persistent log; primary limiter uses KV)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rate_limit_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  scope      TEXT NOT NULL,
  key_hash   TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_rle_scope_key ON rate_limit_events(scope, key_hash, created_at);
