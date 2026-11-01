-- Manual donor ledger for the homepage "Top Donor" highlight.
--
-- ASSUMPTION: HUFRA does not process real payments (no Stripe/PayPal
-- integration - out of scope, would need a payment provider API key and a
-- much larger compliance surface). Donations happen off-platform (bank
-- transfer, cash, etc.) and an admin simply records them here so the
-- current top donor can be displayed. Amounts are denominated in Libyan
-- Dinar (LYD) only, per product decision - no multi-currency support.
CREATE TABLE IF NOT EXISTS donors (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  amount_lyd  REAL NOT NULL CHECK (amount_lyd > 0),
  note        TEXT,
  created_by  INTEGER REFERENCES users(id),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at  TEXT
);

CREATE INDEX IF NOT EXISTS idx_donors_amount ON donors(amount_lyd);

CREATE TRIGGER IF NOT EXISTS trg_donors_updated_at
AFTER UPDATE ON donors
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE donors SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id;
END;
