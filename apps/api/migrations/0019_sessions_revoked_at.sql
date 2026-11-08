-- When an admin's sessions were last ended (suspension, removal of rights, a
-- role change). Sign-in tokens issued before this moment are refused, even
-- after a suspension is lifted, so reinstating an account never revives an
-- old session: the person signs in again.
ALTER TABLE users ADD COLUMN sessions_revoked_at TEXT;
