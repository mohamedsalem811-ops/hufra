-- HUFRA triggers: auto user code, immutable audit log, status history, timestamps

-- ---------------------------------------------------------------------------
-- Auto-generate user code LBY{n}-{year} on insert if not provided
-- ---------------------------------------------------------------------------
CREATE TRIGGER IF NOT EXISTS trg_users_auto_code
AFTER INSERT ON users
WHEN NEW.code IS NULL OR NEW.code = ''
BEGIN
  UPDATE users
  SET code = 'LBY' || (SELECT next_value FROM user_code_seq WHERE id = 1)
             || '-' || strftime('%Y', 'now')
  WHERE id = NEW.id;

  UPDATE user_code_seq SET next_value = next_value + 1 WHERE id = 1;
END;

-- ---------------------------------------------------------------------------
-- Maintain updated_at on users / potholes
-- ---------------------------------------------------------------------------
CREATE TRIGGER IF NOT EXISTS trg_users_updated_at
AFTER UPDATE ON users
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE users SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_potholes_updated_at
AFTER UPDATE ON potholes
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE potholes SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id;
END;

-- ---------------------------------------------------------------------------
-- Auto status_history row whenever a pothole status changes
-- ---------------------------------------------------------------------------
CREATE TRIGGER IF NOT EXISTS trg_potholes_status_history
AFTER UPDATE OF status ON potholes
WHEN NEW.status IS NOT OLD.status
BEGIN
  INSERT INTO status_history (pothole_id, from_status, to_status, at)
  VALUES (NEW.id, OLD.status, NEW.status, strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;

-- ---------------------------------------------------------------------------
-- Immutable audit_logs: forbid UPDATE and DELETE at the database level.
-- Application code must never issue UPDATE/DELETE on audit_logs; these
-- triggers make that a hard guarantee even if application code has a bug.
-- ---------------------------------------------------------------------------
CREATE TRIGGER IF NOT EXISTS trg_audit_logs_no_update
BEFORE UPDATE ON audit_logs
BEGIN
  SELECT RAISE(ABORT, 'audit_logs is immutable: UPDATE is not allowed');
END;

CREATE TRIGGER IF NOT EXISTS trg_audit_logs_no_delete
BEFORE DELETE ON audit_logs
BEGIN
  SELECT RAISE(ABORT, 'audit_logs is immutable: DELETE is not allowed');
END;

-- ---------------------------------------------------------------------------
-- Immutable status_history: same guarantee as audit_logs.
-- ---------------------------------------------------------------------------
CREATE TRIGGER IF NOT EXISTS trg_status_history_no_update
BEFORE UPDATE ON status_history
BEGIN
  SELECT RAISE(ABORT, 'status_history is immutable: UPDATE is not allowed');
END;

CREATE TRIGGER IF NOT EXISTS trg_status_history_no_delete
BEFORE DELETE ON status_history
BEGIN
  SELECT RAISE(ABORT, 'status_history is immutable: DELETE is not allowed');
END;
