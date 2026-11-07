-- Plan 8.2: repair campaigns get a cost breakdown, the contractor, and, once
-- repaired, the final cost and a public receipt photo. Donations remember the
-- pledged amount when the donor later types a different one (review warning).
ALTER TABLE campaigns ADD COLUMN cost_items_json TEXT;
ALTER TABLE campaigns ADD COLUMN contractor TEXT;
ALTER TABLE campaigns ADD COLUMN final_cost_millimes INTEGER CHECK (final_cost_millimes IS NULL OR final_cost_millimes >= 0);
ALTER TABLE campaigns ADD COLUMN receipt_key TEXT;
ALTER TABLE campaigns ADD COLUMN receipt_uploaded_at TEXT;

ALTER TABLE donations ADD COLUMN pledged_millimes INTEGER;
