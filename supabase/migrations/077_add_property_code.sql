-- Migration 077: add property_code to properties.
--
-- The property wizard generates a property code (e.g. 071ALR) and unit codes,
-- but the column was never in the live schema, so there was nowhere to store,
-- view, or set a code. This adds it. Codes are intended to be immutable once
-- set (enforced in the UI), but the column itself is a plain nullable string so
-- existing properties can be backfilled.
--
-- Idempotent — safe to re-run.

ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS property_code VARCHAR(10);

CREATE UNIQUE INDEX IF NOT EXISTS idx_properties_property_code
  ON public.properties(property_code)
  WHERE property_code IS NOT NULL;
