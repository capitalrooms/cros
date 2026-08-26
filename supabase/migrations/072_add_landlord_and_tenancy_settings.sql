-- Migration 072: Add landlord and tenancy settings to properties table
-- Captures foundational property data that all other features depend on

ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS landlord_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS landlord_email VARCHAR(255),
  ADD COLUMN IF NOT EXISTS landlord_phone VARCHAR(20),
  ADD COLUMN IF NOT EXISTS property_type VARCHAR(50) DEFAULT 'hmo',
  ADD COLUMN IF NOT EXISTS council_tax_band CHAR(1),
  ADD COLUMN IF NOT EXISTS has_gas BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS has_electric BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS has_oil BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS furnished_status VARCHAR(20) DEFAULT 'unfurnished',
  ADD COLUMN IF NOT EXISTS bills_included BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS notice_period_months INT DEFAULT 2;

-- Add comments for documentation
COMMENT ON COLUMN public.properties.landlord_name IS 'Name of the property landlord/owner';
COMMENT ON COLUMN public.properties.landlord_email IS 'Landlord email for official communications';
COMMENT ON COLUMN public.properties.landlord_phone IS 'Landlord phone number';
COMMENT ON COLUMN public.properties.property_type IS 'Type of property: hmo (House in Multiple Occupation) or single_let';
COMMENT ON COLUMN public.properties.council_tax_band IS 'UK Council Tax band (A-H)';
COMMENT ON COLUMN public.properties.has_gas IS 'Property has gas central heating or supply';
COMMENT ON COLUMN public.properties.has_electric IS 'Property has electric heating or primary electric supply';
COMMENT ON COLUMN public.properties.has_oil IS 'Property has oil heating';
COMMENT ON COLUMN public.properties.furnished_status IS 'Furnished status: furnished, unfurnished, or part-furnished';
COMMENT ON COLUMN public.properties.bills_included IS 'Whether bills are included in rent';
COMMENT ON COLUMN public.properties.notice_period_months IS 'Required notice period for tenants in months';

-- Create index for landlord lookups
CREATE INDEX IF NOT EXISTS idx_properties_landlord_email ON public.properties(landlord_email);
