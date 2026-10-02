-- 202 — Guarantor on the application. Applicants say whether they'll need one (Homeppl's affordability: yearly
-- income of 30 × the monthly rent, or savings of 36 × held for 3 months; a guarantor earning 36 ×), and if so give
-- the guarantor's full name, mobile and email, which come across to the letting file for referencing.
ALTER TABLE public.applicants
  ADD COLUMN IF NOT EXISTS guarantor_needed TEXT CHECK (guarantor_needed IN ('no', 'yes', 'not_sure')),
  ADD COLUMN IF NOT EXISTS guarantor_name   TEXT,
  ADD COLUMN IF NOT EXISTS guarantor_email  TEXT,
  ADD COLUMN IF NOT EXISTS guarantor_phone  TEXT;
