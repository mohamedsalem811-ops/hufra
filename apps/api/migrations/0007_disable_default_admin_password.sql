-- HUFRA / حفرة — Migration 0007: retire the published default admin password.
--
-- Migration 0006 seeded `admin@hufra.ly` with the password `Hufra@Admin2026!`,
-- and that password was printed in the README and deploy.sh. Anyone who read
-- the repository could log in as super_admin on any deployment still using it.
--
-- 1. The login route now refuses that password even when it matches (see
--    isKnownPublicPassword in src/lib/password.ts). That covers hashes this SQL
--    cannot recognise: the old login code re-hashed it with a random salt.
-- 2. Here, the seeded hash itself is replaced by a value that can never verify,
--    so the account is unusable until the owner runs
--    `npm run admin:set-password` (scripts/set-admin-password.mjs).
-- 3. Every refresh token already issued to that account is revoked, so a
--    session someone opened with the public password ends within 15 minutes
--    (when its access token expires).
--
-- Accounts whose password was already changed keep their password; they only
-- need to log in again.

UPDATE users
SET password_hash = '!disabled:published-default-password'
WHERE email = 'admin@hufra.ly'
  AND password_hash = 'pbkdf2$100000$MDEyMzQ1Njc4OWFiY2RlZg==$lPahV731SKJt5rMZA80HBOQmAH8lO/34xSztRjUiKL0=';

UPDATE refresh_tokens
SET revoked_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE revoked_at IS NULL
  AND user_id IN (SELECT id FROM users WHERE email = 'admin@hufra.ly');
