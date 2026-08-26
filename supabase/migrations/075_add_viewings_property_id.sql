-- Add property_id to viewings (denormalized from room → property).
--
-- The app (LettingsTab.loadViewings, the booking insert, and
-- app/api/viewings/time-shift) all filter/insert viewings by property_id, but
-- the live viewings table only had room_id. Result: the property Lettings tab
-- loaded nothing and booking a viewing failed. A direct property_id also lets
-- us represent whole-property viewings (room_id NULL).
--
-- Safe to re-run.

-- 1. Add the column
ALTER TABLE public.viewings
  ADD COLUMN IF NOT EXISTS property_id UUID REFERENCES public.properties(id) ON DELETE CASCADE;

-- 2. Backfill from the linked room for existing rows
UPDATE public.viewings v
   SET property_id = r.property_id
  FROM public.rooms r
 WHERE v.room_id = r.id
   AND v.property_id IS NULL;

-- 3. Index for the common "viewings for this property" query
CREATE INDEX IF NOT EXISTS idx_viewings_property_id ON public.viewings(property_id);
