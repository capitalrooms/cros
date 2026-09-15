-- Migration 158: Extended tenancy fields
-- Adds fields to match full letting setup: frequency, advance, periodic,
-- rent review, break clause, termination, clauses, occupiers, notes

ALTER TABLE public.tenancies
  ADD COLUMN IF NOT EXISTS rent_frequency        TEXT    DEFAULT 'monthly',   -- monthly | weekly | fortnightly
  ADD COLUMN IF NOT EXISTS rent_in_advance       INT     DEFAULT 1,           -- how many periods paid upfront
  ADD COLUMN IF NOT EXISTS is_periodic           BOOLEAN DEFAULT TRUE,        -- rolls month-to-month after end date
  ADD COLUMN IF NOT EXISTS rent_review_date      DATE,                        -- next potential rent increase
  ADD COLUMN IF NOT EXISTS notice_period_months  INT     DEFAULT 2,           -- notice required from either side
  ADD COLUMN IF NOT EXISTS break_clause_months   INT,                         -- months from start when break can be exercised
  ADD COLUMN IF NOT EXISTS termination_date      DATE,                        -- stops periodic rolling; rent schedule ends here
  ADD COLUMN IF NOT EXISTS special_clauses       TEXT,                        -- additional tenancy agreement terms
  ADD COLUMN IF NOT EXISTS permitted_occupiers   TEXT,                        -- names of additional permitted occupiers
  ADD COLUMN IF NOT EXISTS office_notes          TEXT;                        -- internal admin notes, not visible to tenant/landlord

COMMENT ON COLUMN public.tenancies.rent_frequency       IS 'monthly | weekly | fortnightly';
COMMENT ON COLUMN public.tenancies.rent_in_advance      IS 'Number of rent periods paid upfront at move-in';
COMMENT ON COLUMN public.tenancies.is_periodic          IS 'If true, tenancy auto-extends period-by-period after end_date';
COMMENT ON COLUMN public.tenancies.rent_review_date     IS 'Date from which a rent increase can be applied';
COMMENT ON COLUMN public.tenancies.notice_period_months IS 'Months notice required from either side to end tenancy';
COMMENT ON COLUMN public.tenancies.break_clause_months  IS 'Months from start_date when break clause can be exercised';
COMMENT ON COLUMN public.tenancies.termination_date     IS 'Stops periodic rolling; any rent after this date is removed from schedule';
COMMENT ON COLUMN public.tenancies.special_clauses      IS 'Additional / special clauses for the tenancy agreement';
COMMENT ON COLUMN public.tenancies.permitted_occupiers  IS 'Names of people permitted to occupy who are not on the tenancy';
COMMENT ON COLUMN public.tenancies.office_notes         IS 'Internal admin notes — not visible to tenant or landlord';
