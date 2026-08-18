-- Add missing expiry date columns for compliance certs that only had test dates.
-- The old addYear:true hack in code is replaced by explicit DB fields.

ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS pat_test_expiry              DATE,
  ADD COLUMN IF NOT EXISTS fire_detection_expiry        DATE,
  ADD COLUMN IF NOT EXISTS emergency_lighting_expiry    DATE,
  ADD COLUMN IF NOT EXISTS fire_risk_assessment_expiry  DATE;
