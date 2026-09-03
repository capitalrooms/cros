-- Migration 105: Add communal_bathrooms column to properties
-- Required for HMO property wizard (was referenced in code but never added to schema)

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS communal_bathrooms INTEGER DEFAULT NULL;

COMMENT ON COLUMN properties.communal_bathrooms IS
  'Number of shared bathrooms in the property (HMO only; NULL for single lets)';
