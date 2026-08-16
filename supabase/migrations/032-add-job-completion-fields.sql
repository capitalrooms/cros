-- Migration 032: Add job completion tracking fields
-- Enables contractors to mark jobs as complete with photos, costs, and return-visit reasoning

-- Add completion fields to maintenance_tickets table
ALTER TABLE public.maintenance_tickets ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.maintenance_tickets ADD COLUMN IF NOT EXISTS completed_by UUID REFERENCES public.people(id);
ALTER TABLE public.maintenance_tickets ADD COLUMN IF NOT EXISTS completion_notes TEXT;
ALTER TABLE public.maintenance_tickets ADD COLUMN IF NOT EXISTS photo_before_url TEXT;
ALTER TABLE public.maintenance_tickets ADD COLUMN IF NOT EXISTS photo_after_url TEXT;
ALTER TABLE public.maintenance_tickets ADD COLUMN IF NOT EXISTS cost NUMERIC(10,2);
ALTER TABLE public.maintenance_tickets ADD COLUMN IF NOT EXISTS cost_notes TEXT;
ALTER TABLE public.maintenance_tickets ADD COLUMN IF NOT EXISTS return_visit_needed BOOLEAN DEFAULT false;
ALTER TABLE public.maintenance_tickets ADD COLUMN IF NOT EXISTS return_visit_reason VARCHAR(255);
ALTER TABLE public.maintenance_tickets ADD COLUMN IF NOT EXISTS return_visit_notes TEXT;
ALTER TABLE public.maintenance_tickets ADD COLUMN IF NOT EXISTS return_visit_date_estimate DATE;

-- Create return_visit_reasons lookup table for standardized options
CREATE TABLE IF NOT EXISTS public.return_visit_reasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reason_key VARCHAR(50) UNIQUE NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  category VARCHAR(50), -- e.g., 'drying', 'parts', 'inspection', 'other'
  requires_date_estimate BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert common return-visit reasons
INSERT INTO public.return_visit_reasons (reason_key, display_name, category, requires_date_estimate) VALUES
  ('leave_to_dry', 'Needs to dry/cure', 'drying', true),
  ('waiting_for_parts', 'Waiting for parts', 'parts', true),
  ('specialist_needed', 'Specialist needed for follow-up', 'inspection', true),
  ('inspection_required', 'Landlord/inspector needs to check', 'inspection', true),
  ('tenant_not_home', 'Tenant not home for part of job', 'other', false),
  ('weather_dependent', 'Weather dependent work', 'other', true),
  ('other_return_visit', 'Other reason', 'other', true)
ON CONFLICT (reason_key) DO NOTHING;

-- Create job_completion_log table for audit trail
CREATE TABLE IF NOT EXISTS public.job_completion_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.maintenance_tickets(id) ON DELETE CASCADE,
  status_before VARCHAR(50) NOT NULL,
  status_after VARCHAR(50) NOT NULL,
  completed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  completed_by UUID NOT NULL REFERENCES public.people(id),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_maintenance_tickets_completed_at ON public.maintenance_tickets(completed_at);
CREATE INDEX IF NOT EXISTS idx_maintenance_tickets_completed_by ON public.maintenance_tickets(completed_by);
CREATE INDEX IF NOT EXISTS idx_maintenance_tickets_return_visit_needed ON public.maintenance_tickets(return_visit_needed);
CREATE INDEX IF NOT EXISTS idx_job_completion_log_ticket_id ON public.job_completion_log(ticket_id);
CREATE INDEX IF NOT EXISTS idx_job_completion_log_completed_by ON public.job_completion_log(completed_by);

-- RLS Policies for return_visit_reasons (public read)
ALTER TABLE public.return_visit_reasons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view return visit reasons"
  ON public.return_visit_reasons FOR SELECT
  USING (true);

-- RLS Policies for job_completion_log
ALTER TABLE public.job_completion_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Contractors can view completions for their jobs"
  ON public.job_completion_log FOR SELECT
  USING (
    ticket_id IN (
      SELECT id FROM public.maintenance_tickets
      WHERE assigned_contractor = (
        SELECT id FROM public.people WHERE auth_id = auth.uid()
      )
    )
  );

CREATE POLICY "Admin can view all completion logs"
  ON public.job_completion_log FOR SELECT
  USING (
    (SELECT role FROM public.people WHERE auth_id = auth.uid()) IN ('administrator', 'admin', 'landlord')
  );

CREATE POLICY "System can insert completion logs"
  ON public.job_completion_log FOR INSERT
  WITH CHECK (true);

-- Update maintenance_tickets RLS to allow contractors to update completion fields
CREATE POLICY "Contractors can update completion fields"
  ON public.maintenance_tickets FOR UPDATE
  USING (
    assigned_contractor = (
      SELECT id FROM public.people WHERE auth_id = auth.uid()
    )
    AND status = 'in_progress'
  )
  WITH CHECK (
    assigned_contractor = (
      SELECT id FROM public.people WHERE auth_id = auth.uid()
    )
  );
