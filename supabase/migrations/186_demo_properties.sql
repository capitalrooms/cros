-- Migration 186: mark demo/test properties so they stay out of real figures.
--
-- properties.is_demo = true → excluded from the Money tab, Today, Accounts, arrears and landlord statements.
-- 12 Saltwell Street is the demo house (confirmed by Harry, 27 Sep 2026); "12 Test Street - Workflow Demo" is a test record.
--
-- ADDITIVE ONLY. Idempotent: safe to run more than once.

ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false;

UPDATE public.properties SET is_demo = true
WHERE is_demo = false
  AND (name ILIKE '12 Saltwell Street%' OR name ILIKE '12 Test Street%');
