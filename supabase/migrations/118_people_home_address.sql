-- Migration 118: Home address and company number on people
-- Required for landlord card (AML address verification + company identity)

ALTER TABLE public.people
  ADD COLUMN IF NOT EXISTS home_address   TEXT,
  ADD COLUMN IF NOT EXISTS company_number TEXT;

COMMENT ON COLUMN public.people.home_address   IS 'Residential address — required for AML identity checks on landlords';
COMMENT ON COLUMN public.people.company_number IS 'Companies House registration number for corporate landlords';
