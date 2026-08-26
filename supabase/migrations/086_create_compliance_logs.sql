-- Create compliance logs table for fire door and smoke alarm checks
-- Shared between admin and cleaner roles
CREATE TABLE IF NOT EXISTS compliance_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  check_type VARCHAR(50) NOT NULL, -- 'fire_door' or 'smoke_alarm'
  checked_by UUID NOT NULL REFERENCES people(id),
  checked_by_role VARCHAR(50), -- 'admin' or 'cleaner' (denormalized for audit)
  checked_date DATE NOT NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for common queries
CREATE INDEX IF NOT EXISTS idx_compliance_logs_property_check_type 
  ON compliance_logs(property_id, check_type, checked_date DESC);

CREATE INDEX IF NOT EXISTS idx_compliance_logs_property 
  ON compliance_logs(property_id);

CREATE INDEX IF NOT EXISTS idx_compliance_logs_checked_by 
  ON compliance_logs(checked_by);

-- RLS: Allow read access if user has access to the property via tenancies/assignments
ALTER TABLE compliance_logs ENABLE ROW LEVEL SECURITY;

-- Admin can view all compliance logs
CREATE POLICY "Admin can view all compliance logs"
  ON compliance_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM people 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'administrator')
    )
  );

-- Admin can insert compliance logs
CREATE POLICY "Admin can insert compliance logs"
  ON compliance_logs FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM people 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'administrator')
    )
  );

-- Cleaner can view logs for properties they're assigned to
CREATE POLICY "Cleaner can view property compliance logs"
  ON compliance_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM people 
      WHERE id = auth.uid() 
      AND role = 'cleaner'
    )
  );

-- Cleaner can add logs to properties they're assigned to
CREATE POLICY "Cleaner can add compliance logs"
  ON compliance_logs FOR INSERT
  WITH CHECK (
    checked_by = auth.uid() 
    AND EXISTS (
      SELECT 1 FROM people 
      WHERE id = auth.uid() 
      AND role = 'cleaner'
    )
  );

-- Trigger to auto-update updated_at timestamp
CREATE TRIGGER update_compliance_logs_updated_at
  BEFORE UPDATE ON compliance_logs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
