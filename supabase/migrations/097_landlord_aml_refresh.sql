-- Link onboarding/re-verification records to an existing landlord in people table
-- Nullable: initial enquiries (before they become a landlord) have no people.id yet

ALTER TABLE landlord_onboarding
  ADD COLUMN IF NOT EXISTS landlord_people_id UUID REFERENCES people(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_refresh         BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS refresh_reason     TEXT;  -- e.g. 'periodic_review', 'circumstances_change'

CREATE INDEX IF NOT EXISTS idx_landlord_onboarding_people_id
  ON landlord_onboarding(landlord_people_id);

-- Allow admins to query by landlord_people_id
-- (admin policy from 096 already covers all rows for authenticated admins)
