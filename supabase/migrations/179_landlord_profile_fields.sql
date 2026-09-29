-- Migration 179: Extended landlord profile fields
-- Adds fields required for a complete UK landlord profile:
-- AML (DOB, nationality), tax (NRL status, UTR), management agreement, internal notes

ALTER TABLE public.people
  ADD COLUMN IF NOT EXISTS date_of_birth        DATE,
  ADD COLUMN IF NOT EXISTS nationality          TEXT,
  ADD COLUMN IF NOT EXISTS is_nrl               BOOLEAN  DEFAULT false,   -- Non-Resident Landlord (HMRC scheme)
  ADD COLUMN IF NOT EXISTS utr_number           TEXT,                     -- Unique Taxpayer Reference
  ADD COLUMN IF NOT EXISTS landlord_notes       TEXT,                     -- internal admin notes
  ADD COLUMN IF NOT EXISTS management_type      TEXT CHECK (management_type IN ('full_management','let_only','rent_collection','tenant_find')),
  ADD COLUMN IF NOT EXISTS management_start_date DATE,
  ADD COLUMN IF NOT EXISTS management_fee_notes TEXT;

COMMENT ON COLUMN public.people.date_of_birth         IS 'Required for AML identity verification';
COMMENT ON COLUMN public.people.nationality            IS 'Country of nationality — relevant for NRL and AML';
COMMENT ON COLUMN public.people.is_nrl                IS 'Non-Resident Landlord — triggers HMRC withholding obligations';
COMMENT ON COLUMN public.people.utr_number             IS 'HMRC Unique Taxpayer Reference (10 digits)';
COMMENT ON COLUMN public.people.landlord_notes         IS 'Internal admin notes visible only to staff';
COMMENT ON COLUMN public.people.management_type        IS 'Type of management agreement: full_management, let_only, rent_collection, tenant_find';
COMMENT ON COLUMN public.people.management_start_date  IS 'Date the management agreement began';
COMMENT ON COLUMN public.people.management_fee_notes   IS 'Free-text notes on fee structure, special terms etc';

NOTIFY pgrst, 'reload schema';
