-- HUFRA / حفرة — Migration 0012: per-person read state for team notifications.
--
-- Notifications aimed at a role ("a new report arrived" -> every admin) are a
-- single row with a single read_at, so the first admin who opened the bell
-- marked them read for the whole team. Read state for role-targeted
-- notifications now lives here, one row per (notification, person).
-- Notifications aimed at one user keep using notifications.read_at.
CREATE TABLE IF NOT EXISTS notification_reads (
  notification_id INTEGER NOT NULL REFERENCES notifications(id),
  user_id         INTEGER NOT NULL REFERENCES users(id),
  read_at         TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (notification_id, user_id)
);

-- Role notifications already marked read keep showing as read for everyone,
-- exactly as before; new ones are tracked per person.
INSERT OR IGNORE INTO notification_reads (notification_id, user_id, read_at)
SELECT n.id, u.id, n.read_at
FROM notifications n
JOIN users u ON u.role IN ('admin', 'super_admin') AND u.deleted_at IS NULL
WHERE n.target_role IS NOT NULL AND n.read_at IS NOT NULL;
