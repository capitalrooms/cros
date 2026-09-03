-- Migration 092: Add marketing_description to rooms
-- Stores AI-generated / hand-written advert copy per room for managed properties

ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS marketing_description TEXT DEFAULT NULL;

NOTIFY pgrst, 'reload schema';
