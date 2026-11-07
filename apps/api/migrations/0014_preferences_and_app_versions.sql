-- HUFRA / حفرة — Migration 0014 (plan 7.1): notification preferences.
--
-- Push notifications per kind, chosen by each person in the app's Settings.
-- The in-app inbox always keeps every notification; these only decide whether
-- the phone is also alerted. Both default to on.
ALTER TABLE users ADD COLUMN push_report_updates INTEGER NOT NULL DEFAULT 1 CHECK (push_report_updates IN (0, 1));
ALTER TABLE users ADD COLUMN push_donation_updates INTEGER NOT NULL DEFAULT 1 CHECK (push_donation_updates IN (0, 1));
