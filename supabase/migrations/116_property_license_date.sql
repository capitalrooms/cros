-- Add HMO license issue date to properties
-- license_expiry already exists (migration 013); this adds the issue/start date

ALTER TABLE public.properties
ADD COLUMN IF NOT EXISTS license_date DATE;
