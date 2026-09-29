-- Migration 180: Extended contractor profile fields
-- Adds fields for a complete UK contractor/trade profile

ALTER TABLE public.people
  ADD COLUMN IF NOT EXISTS trade_types             TEXT[],                    -- e.g. {plumber, electrician}
  ADD COLUMN IF NOT EXISTS hourly_rate             DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS callout_fee             DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS day_rate                DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS insurance_company       TEXT,
  ADD COLUMN IF NOT EXISTS insurance_policy_number TEXT,
  ADD COLUMN IF NOT EXISTS insurance_expiry        DATE,
  ADD COLUMN IF NOT EXISTS insurance_value_gbp     DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS dbs_checked_at          DATE,
  ADD COLUMN IF NOT EXISTS dbs_certificate_number  TEXT,
  ADD COLUMN IF NOT EXISTS dbs_expiry              DATE,
  ADD COLUMN IF NOT EXISTS gas_safe_number         TEXT,
  ADD COLUMN IF NOT EXISTS gas_safe_expiry         DATE,
  ADD COLUMN IF NOT EXISTS electrical_cert_number  TEXT,
  ADD COLUMN IF NOT EXISTS electrical_cert_expiry  DATE,
  ADD COLUMN IF NOT EXISTS service_area_notes      TEXT,
  ADD COLUMN IF NOT EXISTS contractor_notes        TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_name  TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_phone TEXT;

COMMENT ON COLUMN public.people.trade_types              IS 'Array of trade types e.g. plumber, electrician, carpenter';
COMMENT ON COLUMN public.people.insurance_expiry         IS 'Public liability insurance expiry — warn if within 30 days';
COMMENT ON COLUMN public.people.dbs_expiry               IS 'DBS check expiry — warn if within 60 days';
COMMENT ON COLUMN public.people.gas_safe_number          IS 'Gas Safe Register licence number';
COMMENT ON COLUMN public.people.gas_safe_expiry          IS 'Gas Safe licence expiry — warn if within 60 days';
COMMENT ON COLUMN public.people.electrical_cert_number   IS 'NICEIC / NAPIT registration number';
COMMENT ON COLUMN public.people.contractor_notes         IS 'Internal admin notes visible only to staff';

NOTIFY pgrst, 'reload schema';
