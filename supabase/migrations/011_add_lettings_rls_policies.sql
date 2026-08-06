-- Enable RLS on rooms and viewings tables if not already enabled
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "anyone_can_read_rooms" ON public.rooms;
DROP POLICY IF EXISTS "lettings_can_read_all_rooms" ON public.rooms;
DROP POLICY IF EXISTS "viewings_read_policy" ON public.viewings;

-- Policy: Lettings role can read all rooms
CREATE POLICY "lettings_can_read_all_rooms" ON public.rooms
  FOR SELECT
  USING (
    auth.jwt() ->> 'email' IN (
      SELECT email FROM public.people WHERE role = 'lettings'
    )
  );

-- Policy: Anyone can read rooms (for now, open access for testing)
CREATE POLICY "anyone_can_read_rooms" ON public.rooms
  FOR SELECT
  USING (true);

-- Policy: Lettings role can read all viewings
CREATE POLICY "lettings_can_read_viewings" ON public.viewings
  FOR SELECT
  USING (
    auth.jwt() ->> 'email' IN (
      SELECT email FROM public.people WHERE role = 'lettings'
    )
  );

-- Policy: Lettings role can insert viewings
CREATE POLICY "lettings_can_insert_viewings" ON public.viewings
  FOR INSERT
  WITH CHECK (
    auth.jwt() ->> 'email' IN (
      SELECT email FROM public.people WHERE role = 'lettings'
    )
  );

-- Policy: Lettings role can update viewings
CREATE POLICY "lettings_can_update_viewings" ON public.viewings
  FOR UPDATE
  USING (
    auth.jwt() ->> 'email' IN (
      SELECT email FROM public.people WHERE role = 'lettings'
    )
  );
