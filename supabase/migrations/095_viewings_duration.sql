-- Migration 095: Add duration_minutes to viewings
-- Allows specifying how long each viewing slot is (e.g. 15 min for back-to-back viewings)

ALTER TABLE public.viewings
  ADD COLUMN IF NOT EXISTS duration_minutes INTEGER DEFAULT 60;

COMMENT ON COLUMN public.viewings.duration_minutes IS
  'Duration of the viewing in minutes. Defaults to 60. Use 15 for rapid back-to-back viewings.';
