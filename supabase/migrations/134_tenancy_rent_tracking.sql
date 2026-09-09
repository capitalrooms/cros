-- Migration 134: Tenancy rent tracking + fixed-term marker
--
-- Adds three columns to tenancies:
--
-- 1. last_rent_change_date DATE
--    When rent was last actually changed — whether via a formal Section 13
--    notice or an informal agreement before the Renters' Rights Act. Used
--    to display "next increase available from" on the tenant card and to
--    inform the 52-week gap calculation when no formal s.13 notice history
--    exists.
--
-- 2. previous_rent_amount NUMERIC(10,2)
--    The rent before the most recent change. Lets the admin see the change
--    history without needing a separate log table.
--
-- 3. is_fixed_term BOOLEAN DEFAULT NULL
--    Explicit admin marker for whether the tenancy is in a genuine fixed
--    term. Three states:
--      TRUE  → admin has confirmed this is still within a fixed-term AST
--      FALSE → admin has confirmed this is periodic (overrides end_date)
--      NULL  → unknown; system uses the heuristic (see rent increase routes)
--
--    The heuristic (when NULL): only treat end_date as a fixed-term marker
--    if the duration from start_date to end_date is ≤ 18 months. Tenancies
--    imported from a spreadsheet with a "contract renewal date" in end_date
--    but a start_date 3+ years ago are periodic, not fixed-term.

ALTER TABLE tenancies
  ADD COLUMN IF NOT EXISTS last_rent_change_date  DATE,
  ADD COLUMN IF NOT EXISTS previous_rent_amount   NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS is_fixed_term          BOOLEAN DEFAULT NULL;

COMMENT ON COLUMN tenancies.last_rent_change_date IS
  'Date rent was last actually changed — formal s.13 notice or informal agreement. '
  'Set automatically when a rent increase notice takes effect; can be set retroactively by admin.';

COMMENT ON COLUMN tenancies.previous_rent_amount IS
  'Rent amount before the most recent change (paired with last_rent_change_date).';

COMMENT ON COLUMN tenancies.is_fixed_term IS
  'Explicit fixed-term marker. TRUE = confirmed fixed-term; FALSE = confirmed periodic '
  '(overrides end_date heuristic); NULL = unknown (system uses duration heuristic).';

-- Index for the rent tracking date (used in "next increase available" queries)
CREATE INDEX IF NOT EXISTS idx_tenancies_last_rent_change
  ON tenancies(last_rent_change_date)
  WHERE last_rent_change_date IS NOT NULL;
