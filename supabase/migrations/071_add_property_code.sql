-- Migration 071: Add property_code field to properties table
-- Allows properties to have editable codes/identifiers (e.g., 071ALR, 012SAS)

ALTER TABLE public.properties
  ADD COLUMN property_code VARCHAR(10) UNIQUE;

-- Add index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_properties_property_code ON public.properties(property_code);

-- Add comment for documentation
COMMENT ON COLUMN public.properties.property_code IS 'Property code/identifier (e.g., 071ALR for Alloa Road). Editable to allow changes.';
