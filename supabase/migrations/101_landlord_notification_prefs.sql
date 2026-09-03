-- Migration 101: Landlord notification preferences
-- Adds: landlord_comms_enabled master switch on people
--       landlord_notification_prefs per-category table
-- Admin controls the master switch; individual categories are per-landlord preferences.

-- Master kill-switch: admin enables before any comms go out (default false = no comms until enabled)
ALTER TABLE people ADD COLUMN IF NOT EXISTS landlord_comms_enabled boolean DEFAULT false;

-- Per-category notification preferences
-- Populated on first admin enable; landlord can toggle categories on their dashboard.
CREATE TABLE IF NOT EXISTS landlord_notification_prefs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id     uuid NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  category      text NOT NULL,
  enabled       boolean NOT NULL DEFAULT true,
  updated_by    uuid REFERENCES people(id),  -- who last changed it (admin or landlord themselves)
  updated_at    timestamptz DEFAULT now(),
  UNIQUE (person_id, category)
);

CREATE INDEX IF NOT EXISTS idx_lnp_person ON landlord_notification_prefs(person_id);

-- RLS
ALTER TABLE landlord_notification_prefs ENABLE ROW LEVEL SECURITY;

-- Admins can read/write all
CREATE POLICY "admins_manage_landlord_prefs"
  ON landlord_notification_prefs
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM people p
      JOIN auth.users u ON p.email = auth.jwt()->>'email'
      WHERE p.id = auth.uid() OR u.id = auth.uid()
        AND p.role IN ('administrator', 'admin')
    )
  );

-- Landlords can read and update only their own prefs
CREATE POLICY "landlord_own_prefs"
  ON landlord_notification_prefs
  FOR ALL
  USING (
    person_id IN (
      SELECT p.id FROM people p
      JOIN auth.users u ON p.email = u.email
      WHERE u.id = auth.uid()
    )
  );
