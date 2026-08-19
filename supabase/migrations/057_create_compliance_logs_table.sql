-- Create compliance logs table for fire door and smoke alarm inspections

CREATE TABLE IF NOT EXISTS public.compliance_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  check_type VARCHAR(50) NOT NULL, -- 'fire_door', 'smoke_alarm', 'both'
  fire_door_status VARCHAR(50), -- 'pass', 'fail', 'not_checked'
  smoke_alarm_status VARCHAR(50), -- 'pass', 'fail', 'not_checked'
  checked_by UUID NOT NULL REFERENCES public.people(id) ON DELETE SET NULL,
  checked_by_role VARCHAR(50) NOT NULL, -- 'admin', 'tenant', 'cleaner'
  checked_by_name VARCHAR(255), -- Denormalized for audit trail
  checked_date DATE NOT NULL,
  notes TEXT,
  photo_url VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::TEXT, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::TEXT, NOW()) NOT NULL
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_compliance_logs_property_id ON public.compliance_logs(property_id);
CREATE INDEX IF NOT EXISTS idx_compliance_logs_date ON public.compliance_logs(checked_date DESC);
CREATE INDEX IF NOT EXISTS idx_compliance_logs_property_date ON public.compliance_logs(property_id, checked_date DESC);
CREATE INDEX IF NOT EXISTS idx_compliance_logs_check_type ON public.compliance_logs(property_id, check_type);

-- Enable Row Level Security
ALTER TABLE public.compliance_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Admins can read all logs for their properties
CREATE POLICY "admins_can_view_compliance_logs" ON public.compliance_logs
  FOR SELECT USING (
    auth.jwt() ->> 'email' IN (
      SELECT email FROM public.people WHERE role = 'administrator'
    )
  );

-- Policy: Admins can insert/update logs
CREATE POLICY "admins_can_modify_compliance_logs" ON public.compliance_logs
  FOR ALL USING (
    auth.jwt() ->> 'email' IN (
      SELECT email FROM public.people WHERE role = 'administrator'
    )
  );

-- Create a function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_compliance_logs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = TIMEZONE('utc'::TEXT, NOW());
  RETURN NEW;
END;
$$ LANGUAGE PLPGSQL;

-- Create a trigger to automatically update updated_at
DROP TRIGGER IF EXISTS update_compliance_logs_updated_at ON public.compliance_logs;
CREATE TRIGGER update_compliance_logs_updated_at
  BEFORE UPDATE ON public.compliance_logs
  FOR EACH ROW EXECUTE FUNCTION public.update_compliance_logs_updated_at();
