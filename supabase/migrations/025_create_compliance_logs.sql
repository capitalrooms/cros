-- Create compliance logs table for tracking fire door and smoke alarm checks
CREATE TABLE IF NOT EXISTS compliance_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  check_type VARCHAR(50) NOT NULL CHECK (check_type IN ('fire_door', 'smoke_alarm')),
  checked_by UUID NOT NULL REFERENCES people(id) ON DELETE SET NULL,
  checked_by_role VARCHAR(50),
  checked_date DATE NOT NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_compliance_logs_property_id ON compliance_logs(property_id);
CREATE INDEX IF NOT EXISTS idx_compliance_logs_property_check_type ON compliance_logs(property_id, check_type);
CREATE INDEX IF NOT EXISTS idx_compliance_logs_checked_by ON compliance_logs(checked_by);

-- RLS
ALTER TABLE compliance_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "compliance_logs_admin_all" ON compliance_logs
  FOR ALL
  USING (
    (SELECT assignment->>'role' FROM people WHERE user_id = auth.uid()) IN ('administrator', 'landlord', 'admin')
  );

CREATE POLICY "compliance_logs_cleaner_read_property" ON compliance_logs
  FOR SELECT
  USING (
    (SELECT assignment->>'role' FROM people WHERE user_id = auth.uid()) = 'cleaner'
    AND property_id IN (
      SELECT property_id FROM people WHERE user_id = auth.uid()
    )
  );
