-- Joint landlord stored on the primary landlord's own record (people.email is NOT NULL UNIQUE,
-- so a second person sharing an email or having none cannot be a separate row).
ALTER TABLE public.people
  ADD COLUMN IF NOT EXISTS joint_salutation TEXT,
  ADD COLUMN IF NOT EXISTS joint_first_name TEXT,
  ADD COLUMN IF NOT EXISTS joint_last_name  TEXT,
  ADD COLUMN IF NOT EXISTS joint_email      TEXT;
