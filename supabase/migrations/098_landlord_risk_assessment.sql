-- Per-landlord risk assessment record (mirrors Capital Rooms Risk Assessment Form 2023)
-- Stored on the landlord_onboarding row so it's tied to each CDD check.

ALTER TABLE landlord_onboarding
  ADD COLUMN IF NOT EXISTS risk_level          TEXT CHECK (risk_level IN ('low','medium','high')),
  ADD COLUMN IF NOT EXISTS risk_reason         TEXT,
  ADD COLUMN IF NOT EXISTS risk_mitigation     TEXT,   -- only if medium/high
  ADD COLUMN IF NOT EXISTS identity_verified   BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS identity_docs       JSONB DEFAULT '[]'::jsonb,  -- list of doc types seen
  ADD COLUMN IF NOT EXISTS risk_assessed_by    UUID REFERENCES people(id),
  ADD COLUMN IF NOT EXISTS risk_assessed_at    TIMESTAMPTZ;

-- Also add risk level to the landlord people record for quick display
ALTER TABLE people
  ADD COLUMN IF NOT EXISTS aml_risk_level      TEXT CHECK (aml_risk_level IN ('low','medium','high')),
  ADD COLUMN IF NOT EXISTS aml_risk_notes      TEXT;
