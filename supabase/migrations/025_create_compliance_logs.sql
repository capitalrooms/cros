-- Create Compliance Logs Tables
-- Tracks monthly fire door and smoke alarm checks per property
-- Shared access between admin and cleaner

-- 1. Create compliance_logs table
CREATE TABLE IF NOT EXISTS public.compliance_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  check_type VARCHAR(50) NOT NULL, -- 'fire_door' or 'smoke_alarm'
  checked_by UUID NOT NULL REFERENCES public.people(id) ON DELETE SET NULL,
  checked_by_role VARCHAR(50), -- 'admin' or 'cleaner' (denormalized for audit)
  checked_date DATE NOT NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_compliance_logs_property_type_date
  ON public.compliance_logs(property_id, check_type, checked_date DESC);
CREATE INDEX IF NOT EXISTS idx_compliance_logs_checked_by
  ON public.compliance_logs(checked_by);
CREATE INDEX IF NOT EXISTS idx_compliance_logs_check_type
  ON public.compliance_logs(check_type);

-- 3. Enable RLS
ALTER TABLE public.compliance_logs ENABLE ROW LEVEL SECURITY;

-- 4. Create RLS policies for development/testing
CREATE POLICY "anyone_can_read_compliance_logs" ON public.compliance_logs
  FOR SELECT USING (true);

CREATE POLICY "authenticated_can_insert_compliance_logs" ON public.compliance_logs
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "authenticated_can_update_compliance_logs" ON public.compliance_logs
  FOR UPDATE USING (auth.role() = 'authenticated');

-- 5. Add constraint for check_type
ALTER TABLE public.compliance_logs
DROP CONSTRAINT IF EXISTS compliance_logs_check_type_check;

ALTER TABLE public.compliance_logs
ADD CONSTRAINT compliance_logs_check_type_check
CHECK (check_type IN ('fire_door', 'smoke_alarm'));
