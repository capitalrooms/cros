-- Migration 107: System settings table + View As support

-- 1. System settings — key/value store for global toggles.
--    Primary use: DB-backed kill switch that admin can toggle without redeploying.
CREATE TABLE IF NOT EXISTS system_settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_by  UUID REFERENCES people(id) ON DELETE SET NULL,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Seed the comms kill switch — OFF by default so real data can be imported safely.
INSERT INTO system_settings (key, value)
VALUES ('comms_live', 'false')
ON CONFLICT (key) DO NOTHING;

-- 2. people.using_app — marks when a contact has independently started using the app.
--    When true, View As for that person becomes read-only (admin can look but not act).
ALTER TABLE people
  ADD COLUMN IF NOT EXISTS using_app BOOLEAN DEFAULT false;

COMMENT ON COLUMN people.using_app IS
  'True once the person is confirmed to be using the app themselves. '
  'Switches View As from writable to read-only for that contact.';

-- 3. Admin View As audit log — lightweight trail of when admin viewed as another user.
CREATE TABLE IF NOT EXISTS admin_view_as_log (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_person_id   UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  viewed_person_id  UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  viewed_role       TEXT,
  started_at        TIMESTAMPTZ DEFAULT NOW(),
  was_writable      BOOLEAN DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_view_as_log_admin ON admin_view_as_log(admin_person_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_view_as_log_viewed ON admin_view_as_log(viewed_person_id, started_at DESC);
