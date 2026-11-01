-- HUFRA / حفرة — Migration 0008: refresh-token rotation and reuse detection.
--
-- Every successful POST /api/auth/refresh now retires the presented refresh
-- token and issues a new one. `replaced_at` records when a token was retired
-- by rotation (as opposed to logout / password change), so that if a retired
-- token is presented again later, the server knows it has been copied
-- (stolen) and signs out every session of that account.
ALTER TABLE refresh_tokens ADD COLUMN replaced_at TEXT;
