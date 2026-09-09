-- Migration 141: Add postcode column to properties table
-- Backfills existing records by extracting UK postcode from the address text

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS postcode VARCHAR(10);

-- Backfill from address text using Postgres regex
-- Extracts patterns like "SW1A 2AA", "E14 3WQ", "N1 2AB" etc.
UPDATE properties
SET postcode = upper(regexp_replace(
  (regexp_match(address, '[A-Z]{1,2}[0-9]{1,2}[A-Z]?\s*[0-9][A-Z]{2}', 'i'))[1],
  '\s+', '', 'g'
))
WHERE address ~ '[A-Z]{1,2}[0-9]{1,2}[A-Z]?\s*[0-9][A-Z]{2}'
  AND postcode IS NULL;

-- Index for postcode lookups
CREATE INDEX IF NOT EXISTS idx_properties_postcode ON properties(postcode);
