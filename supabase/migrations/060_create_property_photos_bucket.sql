-- Create property-photos storage bucket for property photos
INSERT INTO storage.buckets (id, name, owner, public, created_at, updated_at)
VALUES ('property-photos', 'property-photos', NULL, true, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to view photos
CREATE POLICY "Public Access"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'property-photos');

-- Allow admins to upload photos
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

-- Allow admins to delete photos
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
