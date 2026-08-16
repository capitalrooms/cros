-- Create compliance logs table for fire door and smoke alarm checks

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

-- Index for efficient querying by property and type
CREATE INDEX IF NOT EXISTS idx_compliance_logs_property_check_type
  ON compliance_logs(property_id, check_type, checked_date DESC);

CREATE INDEX IF NOT EXISTS idx_compliance_logs_checked_by
  ON compliance_logs(checked_by, checked_date DESC);

-- RLS: Admins can see all; cleaners can see their own property's logs
ALTER TABLE compliance_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "compliance_logs_admin_all" ON compliance_logs
  FOR ALL
  USING (
    (SELECT assignment->>'role' FROM people WHERE user_id = auth.uid()) IN ('administrator', 'admin')
  );

CREATE POLICY "compliance_logs_cleaner_read_property" ON compliance_logs
  FOR SELECT
  USING (
    (SELECT assignment->>'role' FROM people WHERE user_id = auth.uid()) = 'cleaner'
    AND property_id IN (
      SELECT property_id FROM job_bookings
      WHERE cleaner_id = (SELECT id FROM people WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "compliance_logs_cleaner_insert_own" ON compliance_logs
  FOR INSERT
  WITH CHECK (
    (SELECT assignment->>'role' FROM people WHERE user_id = auth.uid()) = 'cleaner'
    AND checked_by = (SELECT id FROM people WHERE user_id = auth.uid())
  );
