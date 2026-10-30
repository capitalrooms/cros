-- Migration 251: the colleagues chosen under "Copy in" when an offer/invite goes out (30 Oct 2026). Later office
-- emails about that applicant (e.g. "holding deposit paid") go only to them — nobody is added automatically.
ALTER TABLE public.applicants ADD COLUMN IF NOT EXISTS staff_cc TEXT[];
