-- Complete Lettings Setup Migration
-- This migration ensures all lettings features are properly set up

-- 1. Add lettings columns to rooms table if they don't exist
ALTER TABLE public.rooms
ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'occupied',
ADD COLUMN IF NOT EXISTS previous_rent NUMERIC(10, 2),
ADD COLUMN IF NOT EXISTS current_asking_rent NUMERIC(10, 2),
ADD COLUMN IF NOT EXISTS available_date DATE,
ADD COLUMN IF NOT EXISTS days_on_market INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS marketing_status VARCHAR(50) DEFAULT 'not_listed',
ADD COLUMN IF NOT EXISTS is_priority BOOLEAN DEFAULT false;

-- 2. Create viewings table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.viewings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  viewing_date DATE NOT NULL,
  viewing_slot VARCHAR(50),
  visitor_name VARCHAR(255),
  visitor_email VARCHAR(255),
  visitor_phone VARCHAR(20),
  viewing_status VARCHAR(50) DEFAULT 'scheduled',
  feedback TEXT,
  viewed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_rooms_status ON public.rooms(status);
CREATE INDEX IF NOT EXISTS idx_rooms_available_date ON public.rooms(available_date);
CREATE INDEX IF NOT EXISTS idx_rooms_is_priority ON public.rooms(is_priority);
CREATE INDEX IF NOT EXISTS idx_viewings_room_id ON public.viewings(room_id);
CREATE INDEX IF NOT EXISTS idx_viewings_viewing_date ON public.viewings(viewing_date);
CREATE INDEX IF NOT EXISTS idx_viewings_viewing_status ON public.viewings(viewing_status);

-- 4. Enable RLS on viewings if not already enabled
ALTER TABLE public.viewings ENABLE ROW LEVEL SECURITY;

-- 5. Create or replace trigger for updated_at on viewings
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  new.updated_at = timezone('utc'::text, now());
  RETURN new;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_viewings_updated_at ON public.viewings;
CREATE TRIGGER update_viewings_updated_at BEFORE UPDATE ON public.viewings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 6. Remove any existing restrictive policies
DROP POLICY IF EXISTS "users_can_read_own_record" ON public.people;
DROP POLICY IF EXISTS "only_admin_can_modify" ON public.people;
DROP POLICY IF EXISTS "lettings_can_read_all_rooms" ON public.rooms;
DROP POLICY IF EXISTS "lettings_can_read_viewings" ON public.viewings;
DROP POLICY IF EXISTS "lettings_can_insert_viewings" ON public.viewings;
DROP POLICY IF EXISTS "lettings_can_update_viewings" ON public.viewings;
DROP POLICY IF EXISTS "anyone_can_read_rooms" ON public.rooms;

-- 7. Add permissive RLS policies for development/testing
-- Allow anyone to read rooms and properties
CREATE POLICY "anyone_can_read_rooms" ON public.rooms
  FOR SELECT USING (true);

CREATE POLICY "anyone_can_read_viewings" ON public.viewings
  FOR SELECT USING (true);

-- Allow authenticated users to manage rooms (for testing/setup)
CREATE POLICY "authenticated_can_insert_rooms" ON public.rooms
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "authenticated_can_update_rooms" ON public.rooms
  FOR UPDATE USING (auth.role() = 'authenticated');

-- Allow authenticated users to manage viewings
CREATE POLICY "authenticated_can_insert_viewings" ON public.viewings
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "authenticated_can_update_viewings" ON public.viewings
  FOR UPDATE USING (auth.role() = 'authenticated');

-- 8. Ensure RLS is enabled on rooms
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;

-- 9. Update people table to ensure lettings role can be assigned
UPDATE public.people SET role = 'lettings' WHERE email = 'lettings@capitalrooms.co.uk';

-- 10. Set some test data on the existing rooms
UPDATE public.rooms
SET
  status = 'available',
  current_asking_rent = 800.00,
  previous_rent = 750.00,
  days_on_market = 30,
  marketing_status = 'listed',
  is_priority = false
WHERE status IS NULL OR status = 'occupied';

-- Ensure we have a status constraint (if not already added)
ALTER TABLE public.rooms
DROP CONSTRAINT IF EXISTS rooms_status_check;

ALTER TABLE public.rooms
ADD CONSTRAINT rooms_status_check CHECK (status IN ('occupied', 'available', 'on_notice'));
