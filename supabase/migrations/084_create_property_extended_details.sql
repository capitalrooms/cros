-- Migration 084: Create property extended details table
-- Stores additional property data: bin days, GP, police, council info, valuations

CREATE TABLE IF NOT EXISTS property_extended_details (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL UNIQUE REFERENCES properties(id) ON DELETE CASCADE,

  -- Waste management (bin collection days)
  bin_black_day VARCHAR(50), -- e.g., "Tuesday"
  bin_blue_day VARCHAR(50),
  bin_green_day VARCHAR(50),
  bin_food_day VARCHAR(50),
  bin_schedule_last_fetched TIMESTAMP,

  -- Local services
  nearest_gp_name VARCHAR(255),
  nearest_gp_address VARCHAR(500),
  nearest_gp_phone VARCHAR(20),
  nearest_gp_postcode VARCHAR(10),
  gp_data_last_fetched TIMESTAMP,

  police_force_name VARCHAR(100),
  police_station_name VARCHAR(100),
  police_station_phone VARCHAR(20),

  -- Council info
  council_tax_band VARCHAR(1), -- A-H
  council_contact_phone VARCHAR(20),
  council_contact_url VARCHAR(500),

  -- Valuations
  estimated_property_value NUMERIC(12,2), -- £
  single_let_rental_value NUMERIC(8,2), -- £/month
  hmo_total_value NUMERIC(12,2), -- £
  valuation_source VARCHAR(50), -- 'zoopla', 'spareroom', 'gov.uk', 'manual'
  valuation_last_updated TIMESTAMP,

  -- Metadata
  manually_edited BOOLEAN DEFAULT false,
  data_last_synced TIMESTAMP,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_property_extended_details_property_id ON property_extended_details(property_id);
CREATE INDEX idx_property_extended_details_last_synced ON property_extended_details(data_last_synced);

-- Enable RLS
ALTER TABLE property_extended_details ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Admin can do everything
CREATE POLICY "property_extended_details_admin_all" ON property_extended_details
  FOR ALL USING (
    (SELECT assignment->>'role' FROM people WHERE user_id = auth.uid()) IN ('administrator', 'admin')
  );

-- Landlords can read their own properties
CREATE POLICY "property_extended_details_landlord_read" ON property_extended_details
  FOR SELECT USING (
    property_id IN (
      SELECT id FROM properties WHERE owner_id = (
        SELECT id FROM people WHERE user_id = auth.uid()
      )
    )
  );

-- Trigger for updated_at timestamp
CREATE OR REPLACE FUNCTION update_property_extended_details_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS property_extended_details_updated_at ON property_extended_details;
CREATE TRIGGER property_extended_details_updated_at
  BEFORE UPDATE ON property_extended_details
  FOR EACH ROW
  EXECUTE FUNCTION update_property_extended_details_updated_at();
