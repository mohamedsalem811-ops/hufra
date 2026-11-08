-- Plan 8.2e: who the admins are and what they look after.
--
-- last_login_at: shown on the admins list, so a forgotten account stands out.
-- suspended_at:  a suspended account cannot sign in or refresh its session;
--                the super admin can lift it. Only admin accounts are suspended
--                (citizens delete their own accounts instead).
-- admin_regions: the regions an admin looks after. Super admins cover all of
--                them and are not listed here.
ALTER TABLE users ADD COLUMN last_login_at TEXT;
ALTER TABLE users ADD COLUMN suspended_at TEXT;

CREATE TABLE IF NOT EXISTS admin_regions (
  user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  region_id INTEGER NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, region_id)
);

CREATE INDEX IF NOT EXISTS idx_admin_regions_region ON admin_regions(region_id);
