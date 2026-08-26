-- Lookup table for self-check issue types
CREATE TABLE IF NOT EXISTS tenant_self_check_issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_key VARCHAR(50) UNIQUE NOT NULL, -- 'door_not_closing', 'strike_plate_loose', etc.
  display_name VARCHAR(255) NOT NULL,
  category VARCHAR(50) NOT NULL, -- 'fire_door' or 'smoke_alarm'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Log of self-check prompts sent and responses received
CREATE TABLE IF NOT EXISTS tenant_self_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenancy_id UUID NOT NULL REFERENCES tenancies(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  check_type VARCHAR(50) NOT NULL, -- 'fire_door' or 'smoke_alarm'
  frequency VARCHAR(50) NOT NULL, -- 'monthly' or 'quarterly'
  request_sent_at TIMESTAMP WITH TIME ZONE NOT NULL,
  response_received_at TIMESTAMP WITH TIME ZONE,
  tenant_response VARCHAR(50), -- 'confirmed_ok', 'issue_reported', 'no_response'
  issue_type VARCHAR(255), -- null if no issue
  issue_description TEXT,
  photo_attachment_url TEXT, -- URL to uploaded photo (if any)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_tenant_self_checks_tenancy 
  ON tenant_self_checks(tenancy_id);

CREATE INDEX IF NOT EXISTS idx_tenant_self_checks_property 
  ON tenant_self_checks(property_id);

CREATE INDEX IF NOT EXISTS idx_tenant_self_checks_room 
  ON tenant_self_checks(room_id);

CREATE INDEX IF NOT EXISTS idx_tenant_self_checks_active 
  ON tenant_self_checks(response_received_at) WHERE response_received_at IS NULL;

-- RLS: Tenants can view their own checks
ALTER TABLE tenant_self_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenants can view their own safety checks"
  ON tenant_self_checks FOR SELECT
  USING (
    tenancy_id IN (
      SELECT id FROM tenancies 
      WHERE tenant_id = auth.uid()
    )
  );

-- Tenants can respond to their checks
CREATE POLICY "Tenants can respond to their safety checks"
  ON tenant_self_checks FOR UPDATE
  USING (
    tenancy_id IN (
      SELECT id FROM tenancies 
      WHERE tenant_id = auth.uid()
    )
  );

-- Admin can view all checks
CREATE POLICY "Admin can view all tenant safety checks"
  ON tenant_self_checks FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM people 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'administrator')
    )
  );

-- Admin can create checks (via cron job)
CREATE POLICY "Admin can create safety checks"
  ON tenant_self_checks FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM people 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'administrator')
    )
  );

-- Cleaner can view checks for their properties (read-only)
CREATE POLICY "Cleaner can view property safety checks"
  ON tenant_self_checks FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM people 
      WHERE id = auth.uid() 
      AND role = 'cleaner'
    )
  );

-- Trigger to auto-update updated_at timestamp
CREATE TRIGGER update_tenant_self_checks_updated_at
  BEFORE UPDATE ON tenant_self_checks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS for issue lookup table (public read-only)
ALTER TABLE tenant_self_check_issues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Everyone can view issue types"
  ON tenant_self_check_issues FOR SELECT
  USING (true);

-- Seed common issue types
INSERT INTO tenant_self_check_issues (issue_key, display_name, category) VALUES
  -- Fire door issues
  ('door_not_closing', 'Door not closing properly', 'fire_door'),
  ('strike_plate_loose', 'Strike plate is loose', 'fire_door'),
  ('gap_around_door', 'Gap visible around door edges', 'fire_door'),
  ('handle_broken', 'Door handle is broken', 'fire_door'),
  ('seal_damaged', 'Door seal is damaged', 'fire_door'),
  -- Smoke alarm issues
  ('battery_low', 'Battery low warning', 'smoke_alarm'),
  ('sensor_not_working', 'Sensor appears unresponsive', 'smoke_alarm'),
  ('missing_batteries', 'Batteries missing', 'smoke_alarm'),
  ('damaged_casing', 'Casing is cracked or damaged', 'smoke_alarm'),
  ('false_alarms', 'Frequent false alarms', 'smoke_alarm'),
  ('missing_unit', 'Smoke alarm is missing', 'smoke_alarm')
ON CONFLICT (issue_key) DO NOTHING;
