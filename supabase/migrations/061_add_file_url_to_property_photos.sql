-- Add file_url column to property_photos table to store the public URL
ALTER TABLE public.property_photos
ADD COLUMN IF NOT EXISTS file_url VARCHAR(512);
