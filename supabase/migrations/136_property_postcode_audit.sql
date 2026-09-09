-- Migration 136: Add postcode/address audit tracking to properties
--
-- When an admin reviews a property's stored address, confirms (or corrects)
-- the postcode via the audit tool, and clicks "Confirm", we stamp these
-- two columns so the checklist can distinguish reviewed properties from
-- those that still need checking.

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS postcode_confirmed_at   TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS postcode_confirmed_by   TEXT        DEFAULT NULL;

-- Index for filtering unconfirmed properties efficiently
CREATE INDEX IF NOT EXISTS idx_properties_postcode_confirmed
  ON properties (postcode_confirmed_at)
  WHERE postcode_confirmed_at IS NULL;
