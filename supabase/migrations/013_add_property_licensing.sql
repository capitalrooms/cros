-- Add licensing, compliance, and communal information to properties table
-- All data entered ONCE at property level, not repeated for each room

ALTER TABLE public.properties
-- Licensing Info
ADD COLUMN IF NOT EXISTS license_number VARCHAR(255),
ADD COLUMN IF NOT EXISTS license_expiry DATE,
ADD COLUMN IF NOT EXISTS council_tax_band VARCHAR(10),
ADD COLUMN IF NOT EXISTS deposit_holder VARCHAR(255),
-- Insurance Info
ADD COLUMN IF NOT EXISTS insurance_provider VARCHAR(255),
ADD COLUMN IF NOT EXISTS insurance_policy_number VARCHAR(255),
ADD COLUMN IF NOT EXISTS insurance_expiry DATE,
-- Annual Testing & Compliance (entered once, applies to whole property)
ADD COLUMN IF NOT EXISTS gas_safe_cert_date DATE,
ADD COLUMN IF NOT EXISTS gas_safe_cert_expiry DATE,
ADD COLUMN IF NOT EXISTS electrical_cert_date DATE,
ADD COLUMN IF NOT EXISTS electrical_cert_expiry DATE,
ADD COLUMN IF NOT EXISTS fire_detection_test_date DATE,
ADD COLUMN IF NOT EXISTS emergency_lighting_test_date DATE,
ADD COLUMN IF NOT EXISTS pat_test_date DATE,
-- Notes visible to all tenants in property
ADD COLUMN IF NOT EXISTS property_notes TEXT,
ADD COLUMN IF NOT EXISTS fire_safety_notes TEXT,
ADD COLUMN IF NOT EXISTS communal_notes TEXT;

-- Create indexes for compliance tracking
CREATE INDEX IF NOT EXISTS idx_properties_license_expiry ON public.properties(license_expiry);
CREATE INDEX IF NOT EXISTS idx_properties_insurance_expiry ON public.properties(insurance_expiry);
CREATE INDEX IF NOT EXISTS idx_properties_gas_safe_expiry ON public.properties(gas_safe_cert_expiry);
CREATE INDEX IF NOT EXISTS idx_properties_electrical_expiry ON public.properties(electrical_cert_expiry);
