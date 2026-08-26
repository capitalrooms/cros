-- Migration 073: Add council information to properties table
-- Stores lookup data for council contact details and bin collection info

ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS council_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS council_email VARCHAR(255),
  ADD COLUMN IF NOT EXISTS council_phone VARCHAR(20),
  ADD COLUMN IF NOT EXISTS council_website VARCHAR(500),
  ADD COLUMN IF NOT EXISTS bin_collection_day VARCHAR(50),
  ADD COLUMN IF NOT EXISTS bin_collection_info JSONB;

-- Add comments for documentation
COMMENT ON COLUMN public.properties.council_name IS 'Local council name for the property';
COMMENT ON COLUMN public.properties.council_email IS 'Council contact email';
COMMENT ON COLUMN public.properties.council_phone IS 'Council contact phone number';
COMMENT ON COLUMN public.properties.council_website IS 'Council website URL';
COMMENT ON COLUMN public.properties.bin_collection_day IS 'Day of week for bin collection (e.g., Monday)';
COMMENT ON COLUMN public.properties.bin_collection_info IS 'JSON data about bin collection (day, type, schedule)';

-- Create index for council lookups
CREATE INDEX IF NOT EXISTS idx_properties_council_name ON public.properties(council_name);
