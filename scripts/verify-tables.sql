-- Run this in Supabase SQL Editor to verify tables exist

-- Check if property_extended_details table exists
SELECT EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_name = 'property_extended_details'
) as extended_details_exists;

-- Check if property_data_corrections table exists
SELECT EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_name = 'property_data_corrections'
) as corrections_exists;

-- Show table structure if they exist
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'property_extended_details' LIMIT 10;

SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'property_data_corrections' LIMIT 10;
