-- 190: Management fees, set up the way lettings software does it (e.g. Arthur Online): a default on the
-- property, which a tenancy can override, with three kinds of fee:
--   pct_received  a % of the rent actually received (Capital Rooms' usual basis — as on the 10ninety statements)
--   pct_charged   a % of the rent due, whether or not it's paid
--   fixed         a fixed £ amount a month
-- The statement uses the tenancy's fee if it has one, otherwise the property's. There is no silent default any
-- more: new properties used to get 12% without anyone choosing it.
-- ADDITIVE ONLY. Idempotent: safe to run more than once.

-- Property default
ALTER TABLE public.properties ALTER COLUMN management_fee_pct DROP DEFAULT;
ALTER TABLE public.properties ALTER COLUMN management_fee_pct DROP NOT NULL;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS management_fee_type  TEXT NOT NULL DEFAULT 'pct_received';
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS management_fee_fixed NUMERIC(10,2);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'properties_management_fee_type_check') THEN
    ALTER TABLE public.properties ADD CONSTRAINT properties_management_fee_type_check
      CHECK (management_fee_type IN ('pct_received', 'pct_charged', 'fixed'));
  END IF;
END $$;

-- Tenancy override (blank = use the property's fee)
ALTER TABLE public.tenancies ADD COLUMN IF NOT EXISTS management_fee_type  TEXT;
ALTER TABLE public.tenancies ADD COLUMN IF NOT EXISTS management_fee_pct   NUMERIC(5,2);
ALTER TABLE public.tenancies ADD COLUMN IF NOT EXISTS management_fee_fixed NUMERIC(10,2);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenancies_management_fee_type_check') THEN
    ALTER TABLE public.tenancies ADD CONSTRAINT tenancies_management_fee_type_check
      CHECK (management_fee_type IS NULL OR management_fee_type IN ('pct_received', 'pct_charged', 'fixed'));
  END IF;
END $$;

COMMENT ON COLUMN public.tenancies.management_fee_type IS 'Overrides the property management fee for this tenancy; NULL = use the property''s';
