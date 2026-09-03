-- Migration 102: Add first_name / last_name to people
-- Run in Supabase SQL editor
-- Note: "name" must be quoted — it is a reserved word in PostgreSQL

ALTER TABLE people
  ADD COLUMN IF NOT EXISTS first_name TEXT,
  ADD COLUMN IF NOT EXISTS last_name  TEXT;

-- Backfill from existing "name" column (split on first space)
UPDATE people
SET
  first_name = CASE
    WHEN "name" IS NULL OR trim("name") = '' THEN NULL
    WHEN position(' ' IN trim("name")) = 0    THEN trim("name")
    ELSE split_part(trim("name"), ' ', 1)
  END,
  last_name = CASE
    WHEN "name" IS NULL OR trim("name") = ''  THEN NULL
    WHEN position(' ' IN trim("name")) = 0    THEN NULL
    ELSE trim(substring(trim("name") FROM position(' ' IN trim("name")) + 1))
  END
WHERE first_name IS NULL;
