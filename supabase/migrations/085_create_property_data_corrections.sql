-- Migration 085: Create property data corrections/suggestions table
-- Tracks suggested corrections to property data from external sources or users

CREATE TABLE IF NOT EXISTS property_data_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,

  -- Field being corrected
  field_name VARCHAR(100) NOT NULL, -- e.g., 'bin_black_day', 'nearest_gp_name', 'single_let_rental_value'
  original_value VARCHAR(500),
  suggested_value VARCHAR(500) NOT NULL,

  -- Source of suggestion
  suggested_by VARCHAR(100), -- 'spareroom', 'waste.co.uk', 'nhs', 'zoopla', 'user_email', 'admin'
  source_url VARCHAR(500), -- Link to where the suggestion came from
  confidence_score NUMERIC(3,2), -- 0.0-1.0 (how confident is the suggestion?)

  -- Admin review
  status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'accepted', 'rejected'
  admin_notes TEXT,
  reviewed_by UUID REFERENCES people(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMP,

  -- User notes
  user_notes TEXT,

  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_property_data_corrections_property_id ON property_data_corrections(property_id);
CREATE INDEX idx_property_data_corrections_status ON property_data_corrections(status);
CREATE INDEX idx_property_data_corrections_field_name ON property_data_corrections(field_name);
CREATE INDEX idx_property_data_corrections_created_at ON property_data_corrections(created_at DESC);

-- Enable RLS
ALTER TABLE property_data_corrections ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Admin can do everything
CREATE POLICY "property_data_corrections_admin_all" ON property_data_corrections
  FOR ALL USING (
    (SELECT assignment->>'role' FROM people WHERE user_id = auth.uid()) IN ('administrator', 'admin')
  );

-- Landlords can read their own properties' corrections
CREATE POLICY "property_data_corrections_landlord_read" ON property_data_corrections
  FOR SELECT USING (
    property_id IN (
      SELECT id FROM properties WHERE owner_id = (
        SELECT id FROM people WHERE user_id = auth.uid()
      )
    )
  );

-- Landlords can insert suggestions for their own properties
CREATE POLICY "property_data_corrections_landlord_insert" ON property_data_corrections
  FOR INSERT WITH CHECK (
    property_id IN (
      SELECT id FROM properties WHERE owner_id = (
        SELECT id FROM people WHERE user_id = auth.uid()
      )
    )
    AND suggested_by = COALESCE((SELECT email FROM people WHERE user_id = auth.uid()), 'unknown')
  );

-- Trigger for updated_at timestamp
CREATE OR REPLACE FUNCTION update_property_data_corrections_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS property_data_corrections_updated_at ON property_data_corrections;
CREATE TRIGGER property_data_corrections_updated_at
  BEFORE UPDATE ON property_data_corrections
  FOR EACH ROW
  EXECUTE FUNCTION update_property_data_corrections_updated_at();
