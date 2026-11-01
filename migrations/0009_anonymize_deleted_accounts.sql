-- HUFRA / حفرة — Migration 0009: actually anonymise deleted accounts.
--
-- POST /api/auth/me/delete used to keep the email address (it only appended
-- ".deleted.<id>"), the display name, the password hash, the reporter's phone
-- number on their reports, and their device push tokens. The route now
-- removes all of that (see src/routes/auth.ts). This migration applies the
-- same clean-up to accounts that were deleted before the fix.
--
-- What remains for a deleted account: its numeric id and pseudonymous code
-- (LBY<n>-<year>), its role, and timestamps, so that reports, status history
-- and the immutable audit log keep pointing at a valid row.

UPDATE potholes SET reporter_contact = NULL
WHERE reporter_id IN (SELECT id FROM users WHERE deleted_at IS NOT NULL);

DELETE FROM device_push_tokens
WHERE user_id IN (SELECT id FROM users WHERE deleted_at IS NOT NULL);

DELETE FROM notifications
WHERE target_user_id IN (SELECT id FROM users WHERE deleted_at IS NOT NULL);

UPDATE refresh_tokens
SET user_agent = NULL, ip_hash = NULL,
    revoked_at = COALESCE(revoked_at, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
WHERE user_id IN (SELECT id FROM users WHERE deleted_at IS NOT NULL);

UPDATE users
SET email = 'deleted-' || id || '@deleted.invalid',
    password_hash = '!deleted',
    display_name = NULL,
    totp_secret = NULL,
    totp_enabled = 0
WHERE deleted_at IS NOT NULL;
