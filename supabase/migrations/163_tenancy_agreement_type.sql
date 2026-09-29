-- Migration 163: Agreement type on tenancies
-- Tracks the legal agreement type used for the tenancy
-- Separate from tenancy_type (standard/short_term) which is operational

ALTER TABLE public.tenancies
  ADD COLUMN IF NOT EXISTS agreement_type TEXT DEFAULT 'assured_periodic';

COMMENT ON COLUMN public.tenancies.agreement_type IS
  'Legal agreement type: assured_periodic | fixed_term | company_let | licence | room_licence';

NOTIFY pgrst, 'reload schema';
