-- Migration 132: Tenancy document pipeline
--
-- 1. Add matching columns to inbox_documents so the docs-inbound webhook can
--    store who a tenancy agreement was matched to and the extracted rent_due_day.
-- 2. Bulk-set rent_due_day = 1 for any active tenancy still null (import gap).
--    Real agreements forwarded to docs@ will overwrite this with the correct value.

-- ── inbox_documents: match + extraction columns ───────────────────────────────
ALTER TABLE inbox_documents
  ADD COLUMN IF NOT EXISTS matched_applicant_id UUID REFERENCES applicants(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS matched_person_id    UUID REFERENCES people(id)     ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS match_confidence     NUMERIC(3,2),
  ADD COLUMN IF NOT EXISTS extracted_rent_due_day INTEGER CHECK (extracted_rent_due_day BETWEEN 1 AND 31);

-- ── tenancies: set default rent_due_day = 1 where still null ─────────────────
-- This unblocks the "Next due" display on the tenant dashboard immediately.
-- When a signed agreement is forwarded to docs@, the pipeline extracts the real
-- value and overwrites this default — the default never prevents correction.
UPDATE tenancies
SET rent_due_day = 1
WHERE rent_due_day IS NULL;
