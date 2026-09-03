-- Migration 112: Add salutation to people table
-- Run in Supabase SQL Editor
--
-- Adds: salutation TEXT (Mr, Mrs, Ms, Miss, Dr, Prof, Rev, Mx)
-- Backfills: strips salutation prefix from full_name, re-splits first/last

-- 1. Add column
ALTER TABLE people
  ADD COLUMN IF NOT EXISTS salutation TEXT;

-- 2. Soft constraint (warning: not enforced on old data; use IF NOT EXISTS to re-run safely)
ALTER TABLE people
  DROP CONSTRAINT IF EXISTS people_salutation_check;
ALTER TABLE people
  ADD CONSTRAINT people_salutation_check
  CHECK (salutation IS NULL OR salutation IN ('Mr','Mrs','Ms','Miss','Dr','Prof','Rev','Mx'));

-- 3. Backfill salutation from full_name prefix
UPDATE people
SET salutation = CASE
    WHEN full_name ~* '^Miss '  THEN 'Miss'
    WHEN full_name ~* '^Mrs '   THEN 'Mrs'
    WHEN full_name ~* '^Mr '    THEN 'Mr'
    WHEN full_name ~* '^Ms '    THEN 'Ms'
    WHEN full_name ~* '^Dr '    THEN 'Dr'
    WHEN full_name ~* '^Prof '  THEN 'Prof'
    WHEN full_name ~* '^Rev '   THEN 'Rev'
    WHEN full_name ~* '^Mx '    THEN 'Mx'
  END
WHERE salutation IS NULL
  AND full_name ~* '^(Miss|Mrs|Mr|Ms|Dr|Prof|Rev|Mx) ';

-- 4. Strip salutation prefix from full_name
UPDATE people
SET full_name = TRIM(REGEXP_REPLACE(full_name, '^(Miss|Mrs|Mr|Ms|Dr|Prof|Rev|Mx)\s+', '', 'i'))
WHERE salutation IS NOT NULL
  AND full_name ~* '^(Miss|Mrs|Mr|Ms|Dr|Prof|Rev|Mx) ';

-- 5. Re-split first/last from the now-clean full_name
UPDATE people
SET
  first_name = CASE
    WHEN full_name IS NULL OR TRIM(full_name) = '' THEN NULL
    WHEN position(' ' IN TRIM(full_name)) = 0       THEN TRIM(full_name)
    ELSE split_part(TRIM(full_name), ' ', 1)
  END,
  last_name = CASE
    WHEN full_name IS NULL OR TRIM(full_name) = '' THEN NULL
    WHEN position(' ' IN TRIM(full_name)) = 0       THEN NULL
    ELSE TRIM(SUBSTRING(TRIM(full_name) FROM position(' ' IN TRIM(full_name)) + 1))
  END
WHERE salutation IS NOT NULL;

-- Verify
SELECT salutation, COUNT(*) FROM people GROUP BY salutation ORDER BY salutation;
