-- Migration 033: Property-level compliance tracking and photo logging
-- Enables admins to view all tenant safety check responses at property level
-- Organize by month, room, and check type
-- Support bulk photo requests

-- Create property_compliance_summary view for quick property-level overview
CREATE VIEW public.property_compliance_summary AS
SELECT
  p.id as property_id,
  p.name as property_name,
  COUNT(DISTINCT tsc.id) as total_checks_sent,
  COUNT(DISTINCT CASE WHEN tsc.response_received_at IS NOT NULL THEN tsc.id END) as checks_completed,
  COUNT(DISTINCT CASE WHEN tsc.tenant_response = 'confirmed_ok' THEN tsc.id END) as checks_ok,
  COUNT(DISTINCT CASE WHEN tsc.tenant_response = 'issue_reported' THEN tsc.id END) as issues_reported,
  COUNT(DISTINCT CASE WHEN tsc.response_received_at IS NULL THEN tsc.id END) as checks_pending,
  MAX(tsc.request_sent_at) as last_check_sent,
  COUNT(DISTINCT CASE WHEN tsc.photo_attachment_url IS NOT NULL THEN tsc.id END) as photos_received
FROM public.properties p
LEFT JOIN public.tenant_self_checks tsc ON tsc.property_id = p.id
GROUP BY p.id, p.name;

-- Create table to track bulk photo requests sent to properties
CREATE TABLE IF NOT EXISTS public.property_photo_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  check_type VARCHAR(50) NOT NULL, -- 'fire_door' or 'smoke_alarm'
  requested_by UUID NOT NULL REFERENCES public.people(id),
  requested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  request_deadline DATE,
  status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'in_progress', 'completed'
  responses_received INTEGER DEFAULT 0,
  total_tenants INTEGER,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create table linking photo requests to specific tenant checks
CREATE TABLE IF NOT EXISTS public.photo_request_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  photo_request_id UUID NOT NULL REFERENCES public.property_photo_requests(id) ON DELETE CASCADE,
  tenant_self_check_id UUID NOT NULL REFERENCES public.tenant_self_checks(id) ON DELETE CASCADE,
  responded_at TIMESTAMP WITH TIME ZONE,
  photo_received BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create monthly compliance summary for property-level reporting
CREATE TABLE IF NOT EXISTS public.property_compliance_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  report_month DATE NOT NULL, -- First day of month (e.g., 2026-08-01)
  check_type VARCHAR(50), -- 'fire_door', 'smoke_alarm', or NULL for all
  total_checks_expected INTEGER,
  checks_received INTEGER,
  photos_received INTEGER,
  issues_reported INTEGER,
  compliance_percentage NUMERIC(5,2), -- 0-100%
  generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  generated_by UUID REFERENCES public.people(id),
  pdf_url TEXT, -- URL to stored PDF in Supabase storage
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_property_photo_requests_property_id ON public.property_photo_requests(property_id);
CREATE INDEX IF NOT EXISTS idx_property_photo_requests_status ON public.property_photo_requests(status);
CREATE INDEX IF NOT EXISTS idx_property_photo_requests_check_type ON public.property_photo_requests(check_type);
CREATE INDEX IF NOT EXISTS idx_photo_request_responses_photo_request_id ON public.photo_request_responses(photo_request_id);
CREATE INDEX IF NOT EXISTS idx_photo_request_responses_tenant_check_id ON public.photo_request_responses(tenant_self_check_id);
CREATE INDEX IF NOT EXISTS idx_property_compliance_reports_property_id ON public.property_compliance_reports(property_id);
CREATE INDEX IF NOT EXISTS idx_property_compliance_reports_month ON public.property_compliance_reports(report_month);
CREATE INDEX IF NOT EXISTS idx_property_compliance_reports_check_type ON public.property_compliance_reports(check_type);

-- RLS Policies

ALTER TABLE public.property_compliance_summary ENABLE ROW LEVEL SECURITY;

-- Admin can view property compliance summaries
CREATE POLICY "Admin can view property compliance summary"
  ON public.property_compliance_summary FOR SELECT
  USING (
    (SELECT role FROM public.people WHERE auth_id = auth.uid()) IN ('administrator', 'admin', 'landlord')
  );

ALTER TABLE public.property_photo_requests ENABLE ROW LEVEL SECURITY;

-- Admin can create and view photo requests
CREATE POLICY "Admin can create photo requests"
  ON public.property_photo_requests FOR INSERT
  WITH CHECK (
    (SELECT role FROM public.people WHERE auth_id = auth.uid()) IN ('administrator', 'admin')
  );

CREATE POLICY "Admin can view photo requests"
  ON public.property_photo_requests FOR SELECT
  USING (
    (SELECT role FROM public.people WHERE auth_id = auth.uid()) IN ('administrator', 'admin', 'landlord')
  );

CREATE POLICY "Admin can update photo requests"
  ON public.property_photo_requests FOR UPDATE
  USING (
    (SELECT role FROM public.people WHERE auth_id = auth.uid()) IN ('administrator', 'admin')
  )
  WITH CHECK (
    (SELECT role FROM public.people WHERE auth_id = auth.uid()) IN ('administrator', 'admin')
  );

ALTER TABLE public.photo_request_responses ENABLE ROW LEVEL SECURITY;

-- Admin can view photo request responses
CREATE POLICY "Admin can view photo request responses"
  ON public.photo_request_responses FOR SELECT
  USING (
    (SELECT role FROM public.people WHERE auth_id = auth.uid()) IN ('administrator', 'admin', 'landlord')
  );

-- System can insert responses
CREATE POLICY "System can insert photo request responses"
  ON public.photo_request_responses FOR INSERT
  WITH CHECK (true);

ALTER TABLE public.property_compliance_reports ENABLE ROW LEVEL SECURITY;

-- Admin and landlord can view reports
CREATE POLICY "Admin can view compliance reports"
  ON public.property_compliance_reports FOR SELECT
  USING (
    (SELECT role FROM public.people WHERE auth_id = auth.uid()) IN ('administrator', 'admin', 'landlord')
  );

-- Admin can create reports
CREATE POLICY "Admin can create compliance reports"
  ON public.property_compliance_reports FOR INSERT
  WITH CHECK (
    (SELECT role FROM public.people WHERE auth_id = auth.uid()) IN ('administrator', 'admin')
  );
