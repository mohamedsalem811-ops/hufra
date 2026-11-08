-- Plan 9.1: the audit log stays unchangeable, with one exception: the daily
-- clean-up may clear a record's hashed IP address after 90 days (the privacy
-- policy promises technical records are kept 90 days). Every other column is
-- still protected, and no record can be deleted.
DROP TRIGGER IF EXISTS trg_audit_logs_no_update;

CREATE TRIGGER trg_audit_logs_no_update
BEFORE UPDATE ON audit_logs
WHEN NEW.ip_hash IS NOT NULL
  OR NEW.id IS NOT OLD.id
  OR NEW.actor_id IS NOT OLD.actor_id
  OR NEW.action IS NOT OLD.action
  OR NEW.entity IS NOT OLD.entity
  OR NEW.entity_id IS NOT OLD.entity_id
  OR NEW.before_json IS NOT OLD.before_json
  OR NEW.after_json IS NOT OLD.after_json
  OR NEW.created_at IS NOT OLD.created_at
BEGIN
  SELECT RAISE(ABORT, 'audit_logs is immutable: only clearing ip_hash is allowed');
END;
