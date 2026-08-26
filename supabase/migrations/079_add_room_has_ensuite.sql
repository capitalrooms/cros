-- Migration 079: per-room ensuite flag.
-- Lets the floor-plan scan (and admins) mark which rooms have their own ensuite,
-- shown on the unit dashboard. Idempotent.

ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS has_ensuite BOOLEAN DEFAULT false;

NOTIFY pgrst, 'reload schema';
