-- Migration 078: extend property_photos for room classification (marketing photos).
--
-- property_photos already exists (migration 059) as the property photo bank with
-- file_path / file_url / property_id. This migration ADDS the columns needed to
-- classify each photo to a specific room (room_id NULL = communal / whole
-- property) so a room-tagged photo shows in both the property bank and the room.
--
-- Uses ADD COLUMN IF NOT EXISTS (not CREATE TABLE) because the table already
-- exists — a bare CREATE TABLE IF NOT EXISTS would no-op and add nothing.
-- Idempotent — safe to re-run.

-- Create it if this is a fresh install where 059 never ran.
CREATE TABLE IF NOT EXISTS public.property_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  file_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add the room-classification + marketing columns to the existing table.
-- Each is its own statement with NO foreign key: a multi-clause ALTER with FKs
-- rolls back atomically if any clause trips on the existing data, which left
-- room_id unadded. Plain UUID columns are all the app needs.
ALTER TABLE public.property_photos ADD COLUMN IF NOT EXISTS room_id UUID;
ALTER TABLE public.property_photos ADD COLUMN IF NOT EXISTS caption TEXT;
ALTER TABLE public.property_photos ADD COLUMN IF NOT EXISTS is_marketing BOOLEAN DEFAULT true;
ALTER TABLE public.property_photos ADD COLUMN IF NOT EXISTS display_order INT DEFAULT 0;
ALTER TABLE public.property_photos ADD COLUMN IF NOT EXISTS created_by UUID;

CREATE INDEX IF NOT EXISTS idx_property_photos_property_id ON public.property_photos(property_id);
CREATE INDEX IF NOT EXISTS idx_property_photos_room_id ON public.property_photos(room_id);

ALTER TABLE public.property_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS property_photos_admin_all ON public.property_photos;
CREATE POLICY property_photos_admin_all ON public.property_photos
  FOR ALL TO authenticated
  USING (
    (SELECT role FROM public.people WHERE email = auth.jwt() ->> 'email')
      IN ('administrator','landlord','admin')
  )
  WITH CHECK (
    (SELECT role FROM public.people WHERE email = auth.jwt() ->> 'email')
      IN ('administrator','landlord','admin')
  );

-- Ask PostgREST to reload its schema cache so the new columns are visible.
NOTIFY pgrst, 'reload schema';
