-- Create tenant_self_checks table for fire door and smoke alarm monthly checks
CREATE TABLE IF NOT EXISTS public.tenant_self_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenancy_id UUID NOT NULL REFERENCES public.tenancies(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  check_type VARCHAR(50) NOT NULL, -- 'fire_door' or 'smoke_alarm'
  frequency VARCHAR(50) NOT NULL, -- 'monthly' or 'quarterly'
  request_sent_at TIMESTAMP WITH TIME ZONE NOT NULL,
  response_received_at TIMESTAMP WITH TIME ZONE,
  tenant_response VARCHAR(50), -- 'confirmed_ok', 'issue_reported', 'no_response'
  issue_type VARCHAR(255), -- e.g., 'door_not_closing', 'battery_low'
  issue_description TEXT,
  photo_attachment_url TEXT, -- URL to photo in Supabase storage (quarterly only)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create tenant_self_check_issues lookup table
CREATE TABLE IF NOT EXISTS public.tenant_self_check_issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_key VARCHAR(50) UNIQUE NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  category VARCHAR(50) NOT NULL, -- 'fire_door' or 'smoke_alarm'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert fire door issue types
INSERT INTO public.tenant_self_check_issues (issue_key, display_name, category) VALUES
  ('door_not_closing', 'Door not closing properly', 'fire_door'),
  ('strike_plate_loose', 'Strike plate loose or damaged', 'fire_door'),
  ('gap_under_door', 'Gaps around door frame', 'fire_door'),
  ('seal_damaged', 'Door seal damaged', 'fire_door'),
  ('handle_broken', 'Handle or mechanism broken', 'fire_door'),
  ('other_fire_door', 'Other issue', 'fire_door')
ON CONFLICT (issue_key) DO NOTHING;

-- Insert smoke alarm issue types
INSERT INTO public.tenant_self_check_issues (issue_key, display_name, category) VALUES
  ('battery_low', 'Battery low or beeping', 'smoke_alarm'),
  ('alarm_not_working', 'Alarm not responding to test', 'smoke_alarm'),
  ('missing_alarm', 'Alarm missing or removed', 'smoke_alarm'),
  ('alarm_dirty', 'Alarm looks dirty or dusty', 'smoke_alarm'),
  ('other_smoke_alarm', 'Other issue', 'smoke_alarm')
ON CONFLICT (issue_key) DO NOTHING;

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_tenant_self_checks_tenancy_id ON public.tenant_self_checks(tenancy_id);
CREATE INDEX IF NOT EXISTS idx_tenant_self_checks_property_id ON public.tenant_self_checks(property_id);
CREATE INDEX IF NOT EXISTS idx_tenant_self_checks_room_id ON public.tenant_self_checks(room_id);
CREATE INDEX IF NOT EXISTS idx_tenant_self_checks_check_type ON public.tenant_self_checks(check_type);
CREATE INDEX IF NOT EXISTS idx_tenant_self_checks_response_status ON public.tenant_self_checks(tenant_response);
CREATE INDEX IF NOT EXISTS idx_tenant_self_checks_sent_date ON public.tenant_self_checks(request_sent_at);

-- RLS Policies

-- Tenants can view their own self-checks
CREATE POLICY "Tenants can view own self-checks"
  ON public.tenant_self_checks FOR SELECT
  USING (
    tenancy_id IN (
      SELECT t.id FROM public.tenancies t
      WHERE t.tenant_id = (
        SELECT id FROM public.people WHERE auth_id = auth.uid()
      )
    )
  );

-- Tenants can update their own self-checks (submit responses)
CREATE POLICY "Tenants can update own self-checks"
  ON public.tenant_self_checks FOR UPDATE
  USING (
    tenancy_id IN (
      SELECT t.id FROM public.tenancies t
      WHERE t.tenant_id = (
        SELECT id FROM public.people WHERE auth_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    tenancy_id IN (
      SELECT t.id FROM public.tenancies t
      WHERE t.tenant_id = (
        SELECT id FROM public.people WHERE auth_id = auth.uid()
      )
    )
  );

-- Admin and landlord can view all self-checks
CREATE POLICY "Admin can view all self-checks"
  ON public.tenant_self_checks FOR SELECT
  USING (
    (SELECT role FROM public.people WHERE auth_id = auth.uid()) IN ('administrator', 'admin', 'landlord')
  );

-- Admin can create self-checks (for cron job)
CREATE POLICY "Admin can create self-checks"
  ON public.tenant_self_checks FOR INSERT
  WITH CHECK (
    (SELECT role FROM public.people WHERE auth_id = auth.uid()) IN ('administrator', 'admin')
  );

-- RLS for issue lookup table (public read)
CREATE POLICY "Anyone can view issue types"
  ON public.tenant_self_check_issues FOR SELECT
  USING (true);

ALTER TABLE public.tenant_self_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_self_check_issues ENABLE ROW LEVEL SECURITY;
