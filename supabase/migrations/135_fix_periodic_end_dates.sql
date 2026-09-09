-- Migration 135: Mark long-running tenancies as periodic (not fixed-term)
--
-- The September 2026 CSV import applied end_dates to all 44 tenancies.
-- For tenancies where end_date is more than 18 months after start_date,
-- the end_date cannot represent a genuine initial fixed-term AST (UK fixed
-- terms are typically 6–12 months). These end_dates were pulled from a
-- "contract renewal date" or similar column in the source spreadsheet.
--
-- We set is_fixed_term = FALSE for these 20 tenancies, which explicitly
-- marks them as periodic and causes the admin UI / Section 13 route to
-- skip the fixed-term block. The end_date is left intact (it may still be
-- useful as a "current agreement expires" date).
--
-- The 24 tenancies with start→end ≤ 18 months are left untouched —
-- they may genuinely be in their initial fixed term.
--
-- Run after migration 134 (which adds the is_fixed_term column).

UPDATE tenancies
SET is_fixed_term = FALSE
WHERE
  end_date IS NOT NULL
  AND notice_received_date IS NULL
  AND (end_date::date - start_date::date) > 548  -- 18 months ≈ 548 days
  AND is_fixed_term IS NULL;  -- don't overwrite any explicit admin override

-- Show what was updated (informational — runs in a transaction)
DO $$
DECLARE
  updated_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO updated_count
  FROM tenancies
  WHERE is_fixed_term = FALSE
    AND (end_date::date - start_date::date) > 548;
  RAISE NOTICE 'Marked % tenancies as is_fixed_term = FALSE (periodic)', updated_count;
END $$;
