-- 213 — Applicants can be archived (Harry, 9 Oct 2026): someone who withdrew, a duplicate, or a test. They leave the
-- Applicants list but are kept, with who/when/why, and can be restored. Nothing is deleted.
-- ADDITIVE ONLY. Idempotent: safe to run more than once.
ALTER TABLE public.applicants ADD COLUMN IF NOT EXISTS archived_at     TIMESTAMPTZ;
ALTER TABLE public.applicants ADD COLUMN IF NOT EXISTS archived_reason TEXT;
ALTER TABLE public.applicants ADD COLUMN IF NOT EXISTS archived_by     TEXT;
