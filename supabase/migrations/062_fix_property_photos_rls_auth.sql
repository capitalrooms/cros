-- Fix RLS policies for property_photos table - use email-based auth instead of uid
-- This fixes the auth mismatch issue where people.id ≠ auth.uid()

-- Drop existing policies with wrong auth
DROP POLICY IF EXISTS "Admins can view all property photos" ON public.property_photos;
DROP POLICY IF EXISTS "Admins can insert property photos" ON public.property_photos;
DROP POLICY IF EXISTS "Admins can update property photos" ON public.property_photos;
DROP POLICY IF EXISTS "Admins can delete property photos" ON public.property_photos;

-- Recreate with correct email-based auth
CREATE POLICY "Admins can view all property photos"
  ON public.property_photos
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.people
      WHERE people.email = auth.jwt()->>'email'
      AND (people.role = 'administrator' OR people.role = 'admin')
    )
  );

CREATE POLICY "Admins can insert property photos"
  ON public.property_photos
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.people
      WHERE people.email = auth.jwt()->>'email'
      AND (people.role = 'administrator' OR people.role = 'admin')
    )
  );

CREATE POLICY "Admins can update property photos"
  ON public.property_photos
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.people
      WHERE people.email = auth.jwt()->>'email'
      AND (people.role = 'administrator' OR people.role = 'admin')
    )
  );

CREATE POLICY "Admins can delete property photos"
  ON public.property_photos
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.people
      WHERE people.email = auth.jwt()->>'email'
      AND (people.role = 'administrator' OR people.role = 'admin')
    )
  );

-- Fix storage bucket policies
DROP POLICY IF EXISTS "Admins can upload photos" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete photos" ON storage.objects;

CREATE POLICY "Admins can upload photos"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'property-photos' AND
    EXISTS (
      SELECT 1 FROM public.people
      WHERE people.email = auth.jwt()->>'email'
      AND (people.role = 'administrator' OR people.role = 'admin')
    )
  );

CREATE POLICY "Admins can delete photos"
  ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'property-photos' AND
    EXISTS (
      SELECT 1 FROM public.people
      WHERE people.email = auth.jwt()->>'email'
      AND (people.role = 'administrator' OR people.role = 'admin')
    )
  );

-- Fix properties table RLS policies for updating featured_photo_id
DROP POLICY IF EXISTS "Admins can update properties" ON public.properties;

CREATE POLICY "Admins can update properties"
  ON public.properties
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.people
      WHERE people.email = auth.jwt()->>'email'
      AND (people.role = 'administrator' OR people.role = 'admin')
    )
  );
