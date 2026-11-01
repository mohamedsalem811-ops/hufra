-- HUFRA / حفرة — Migration 0011: potholes.updated_at changes only when the
-- report itself changes.
--
-- The old trigger fired on ANY update, so every page view (view_count + 1)
-- and every upvote also rewrote updated_at. Each view therefore cost two D1
-- writes, and since the homepage showcase is ordered by updated_at, simply
-- viewing or upvoting a report moved it around. Now the trigger fires only
-- when a column describing the report changes. View and upvote counters and
-- the reporter link (cleared on account deletion) are deliberately excluded.
DROP TRIGGER IF EXISTS trg_potholes_updated_at;

CREATE TRIGGER trg_potholes_updated_at
AFTER UPDATE OF region_id, lat, lng, length_cm, width_cm, depth_cm, severity, status,
  description_ar, description_en, street_ar, street_en,
  verified_at, under_repair_at, fixed_at, deleted_at
ON potholes
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE potholes SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id;
END;
