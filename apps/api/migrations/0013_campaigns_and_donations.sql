-- HUFRA / حفرة — Migration 0013: repair campaigns and donations (plan 6.9).
--
-- Money is stored as whole thousandths of a Libyan dinar ("millimes",
-- 1 LYD = 1000) so totals are exact; people only ever see dinar.
--
-- A campaign raises the repair cost of one pothole. Donations are made by
-- signed-in people, by bank transfer (LYPAY / same-bank) now and by card
-- (Moamalat) later. A bank transfer is a pledge with a unique reference code
-- until the donor uploads the transfer screenshot (under_review); the team
-- then confirms or rejects it. Only confirmed money counts as raised.
-- Money left over when a campaign closes (or all of it, if cancelled) goes to
-- a shared pool that the team moves into later campaigns (allocations).

CREATE TABLE IF NOT EXISTS campaigns (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  pothole_id       INTEGER NOT NULL REFERENCES potholes(id),
  target_millimes  INTEGER NOT NULL CHECK (target_millimes > 0),
  status           TEXT    NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'funded', 'completed', 'cancelled')),
  note_ar          TEXT,
  note_en          TEXT,
  close_reason     TEXT,
  created_by       INTEGER REFERENCES users(id),
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  funded_at        TEXT,
  closed_at        TEXT
);

-- At most one open (active or funded) campaign per pothole.
CREATE UNIQUE INDEX IF NOT EXISTS idx_campaigns_open_per_pothole
  ON campaigns(pothole_id) WHERE status IN ('active', 'funded');
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status, created_at);

CREATE TABLE IF NOT EXISTS donations (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id       INTEGER NOT NULL REFERENCES campaigns(id),
  user_id           INTEGER NOT NULL REFERENCES users(id),
  reference_code    TEXT    NOT NULL UNIQUE,
  method            TEXT    NOT NULL DEFAULT 'bank_transfer' CHECK (method IN ('bank_transfer', 'card_moamalat')),
  amount_millimes   INTEGER NOT NULL CHECK (amount_millimes > 0),
  status            TEXT    NOT NULL DEFAULT 'awaiting_transfer'
                    CHECK (status IN ('awaiting_transfer', 'under_review', 'confirmed', 'rejected', 'expired', 'cancelled')),
  show_name         INTEGER NOT NULL DEFAULT 0 CHECK (show_name IN (0, 1)),
  -- Transfer screenshot: private R2 object (never served publicly) and its SHA-256,
  -- unique so one screenshot cannot back two donations.
  proof_key         TEXT,
  proof_sha256      TEXT UNIQUE,
  proof_uploaded_at TEXT,
  -- Card payments (Moamalat, later): the gateway's own transaction reference.
  gateway_reference TEXT UNIQUE,
  reviewed_by       INTEGER REFERENCES users(id),
  reviewed_at       TEXT,
  reject_reason     TEXT,
  expires_at        TEXT,
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_donations_campaign_status ON donations(campaign_id, status);
CREATE INDEX IF NOT EXISTS idx_donations_user ON donations(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_donations_status ON donations(status, created_at);

-- Money moved from the shared pool (from_campaign_id NULL) into a campaign.
CREATE TABLE IF NOT EXISTS campaign_allocations (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  to_campaign_id   INTEGER NOT NULL REFERENCES campaigns(id),
  amount_millimes  INTEGER NOT NULL CHECK (amount_millimes > 0),
  note             TEXT,
  created_by       INTEGER REFERENCES users(id),
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_allocations_to ON campaign_allocations(to_campaign_id);

-- Settings the team edits in the admin panel (bank details for donations,
-- how the app opens the donation page, later contact and legal details).
CREATE TABLE IF NOT EXISTS app_settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_by  INTEGER REFERENCES users(id),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- One-time links that open the website already signed in (from the app's
-- "Donate" button). Only the SHA-256 of the token is stored; each works once,
-- for 60 seconds.
CREATE TABLE IF NOT EXISTS web_handoff_tokens (
  token_hash  TEXT PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  next_path   TEXT NOT NULL,
  expires_at  TEXT NOT NULL,
  used_at     TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_web_handoff_expires ON web_handoff_tokens(expires_at);

CREATE TRIGGER IF NOT EXISTS trg_campaigns_updated_at
AFTER UPDATE ON campaigns
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE campaigns SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_donations_updated_at
AFTER UPDATE ON donations
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE donations SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id;
END;
