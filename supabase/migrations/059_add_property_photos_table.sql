-- Create property_photos table to track uploaded photos
CREATE TABLE IF NOT EXISTS public.property_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  file_name VARCHAR(255) NOT NULL,
  file_path VARCHAR(512) NOT NULL,
  file_size INTEGER,
  file_type VARCHAR(50),
  is_featured BOOLEAN DEFAULT FALSE,
  uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add featured_photo_id to properties if not exists
ALTER TABLE public.properties
ADD COLUMN IF NOT EXISTS featured_photo_id UUID REFERENCES public.property_photos(id) ON DELETE SET NULL;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_property_photos_property_id ON public.property_photos(property_id);
CREATE INDEX IF NOT EXISTS idx_property_photos_is_featured ON public.property_photos(is_featured);

-- RLS Policies
ALTER TABLE public.property_photos ENABLE ROW LEVEL SECURITY;

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
