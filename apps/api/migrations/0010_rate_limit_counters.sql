-- HUFRA / حفرة — Migration 0010: rate-limit counters in D1 instead of KV.
--
-- The KV limiter did a read and then a write, so parallel requests all saw
-- the same count and could exceed the limit, and every check used one of KV's
-- 1,000 free writes per day. Here each check is ONE atomic upsert that returns
-- the new count (D1 runs writes one at a time), and D1's free tier allows
-- 100,000 writes per day.
--
-- bucket = "<scope>:<sha256(secret + key)>": raw IPs are never stored.
-- window_start = the fixed window number (unix seconds / window length).
-- Rows expire at expires_at and are pruned opportunistically.
CREATE TABLE IF NOT EXISTS rate_limit_counters (
  bucket       TEXT    NOT NULL,
  window_start INTEGER NOT NULL,
  count        INTEGER NOT NULL DEFAULT 0,
  expires_at   INTEGER NOT NULL,
  PRIMARY KEY (bucket, window_start)
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_counters_expires ON rate_limit_counters(expires_at);

-- The old, never-used fallback table.
DROP TABLE IF EXISTS rate_limit_events;
