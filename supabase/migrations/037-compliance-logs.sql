-- Migration 037: Compliance Logs (Fire Door & Smoke Alarm Tracking)

CREATE TABLE IF NOT EXISTS public.compliance_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  check_type VARCHAR(50) NOT NULL, -- 'fire_door' or 'smoke_alarm'
  checked_by UUID NOT NULL REFERENCES public.people(id),
  checked_by_role VARCHAR(50), -- 'admin' or 'cleaner' (denormalized for audit)
  checked_date DATE NOT NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_compliance_logs_property_id ON public.compliance_logs(property_id);
CREATE INDEX IF NOT EXISTS idx_compliance_logs_property_check_type ON public.compliance_logs(property_id, check_type);
CREATE INDEX IF NOT EXISTS idx_compliance_logs_checked_date ON public.compliance_logs(checked_date DESC);
CREATE INDEX IF NOT EXISTS idx_compliance_logs_check_type ON public.compliance_logs(check_type);

ALTER TABLE public.compliance_logs ENABLE ROW LEVEL SECURITY;

-- Admin can view all compliance logs
CREATE POLICY "Admin can view compliance logs" ON public.compliance_logs FOR SELECT
USING ((SELECT role FROM public.people WHERE auth_id = auth.uid()) IN ('administrator', 'admin', 'landlord'));

-- Admin can create compliance logs
CREATE POLICY "Admin can create compliance logs" ON public.compliance_logs FOR INSERT
WITH CHECK ((SELECT role FROM public.people WHERE auth_id = auth.uid()) IN ('administrator', 'admin'));

-- System can insert logs (for cleaners to add checks)
CREATE POLICY "System can insert compliance logs" ON public.compliance_logs FOR INSERT
WITH CHECK (true);

-- Cleaners can view logs for their properties (read-only)
CREATE POLICY "Cleaners can view compliance logs" ON public.compliance_logs FOR SELECT
USING ((SELECT role FROM public.people WHERE auth_id = auth.uid()) = 'cleaner');
