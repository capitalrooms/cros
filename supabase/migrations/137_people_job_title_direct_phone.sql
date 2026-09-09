-- Migration 137: Add job title and direct phone to people table
--
-- These fields populate the sign-off block on every CROS-generated PDF:
--   Yours sincerely,
--   [signature gap]
--   [full_name]          ← already exists
--   [job_title]          ← NEW
--   [direct_phone]       ← NEW
--
-- Staff members (administrators, lettings) fill these in once via their profile.
-- The PDF generators pull them dynamically for whoever is logged in — no more
-- hardcoded names or job titles in any PDF generator.

ALTER TABLE public.people
  ADD COLUMN IF NOT EXISTS job_title    TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS direct_phone TEXT DEFAULT NULL;

COMMENT ON COLUMN public.people.job_title    IS 'e.g. "Lettings Manager", "Director". Shown in PDF sign-off blocks.';
COMMENT ON COLUMN public.people.direct_phone IS 'Direct line shown in PDF sign-off blocks, e.g. "07700 900 123".';
