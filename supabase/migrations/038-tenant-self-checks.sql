-- Migration 038: Tenant Self-Check Tracking (Fire Door & Smoke Alarm)

-- Categorized issue types (lookup table)
CREATE TABLE IF NOT EXISTS public.tenant_self_check_issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_key VARCHAR(50) UNIQUE NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  category VARCHAR(50) NOT NULL, -- 'fire_door' or 'smoke_alarm'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Log of self-check prompts sent and responses received
CREATE TABLE IF NOT EXISTS public.tenant_self_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenancy_id UUID NOT NULL REFERENCES public.tenancies(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  check_type VARCHAR(50) NOT NULL, -- 'fire_door' or 'smoke_alarm'
  frequency VARCHAR(50) NOT NULL DEFAULT 'monthly', -- 'monthly' or 'quarterly'
  request_sent_at TIMESTAMP WITH TIME ZONE NOT NULL,
  response_received_at TIMESTAMP WITH TIME ZONE,
  tenant_response VARCHAR(50), -- 'confirmed_ok', 'issue_reported', 'no_response'
  issue_type VARCHAR(255), -- null if no issue (e.g., 'door_not_closing', 'battery_low')
  issue_description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_tenant_self_checks_tenancy_id ON public.tenant_self_checks(tenancy_id);
CREATE INDEX IF NOT EXISTS idx_tenant_self_checks_property_id ON public.tenant_self_checks(property_id);
CREATE INDEX IF NOT EXISTS idx_tenant_self_checks_room_id ON public.tenant_self_checks(room_id);
CREATE INDEX IF NOT EXISTS idx_tenant_self_checks_response ON public.tenant_self_checks(response_received_at DESC);
CREATE INDEX IF NOT EXISTS idx_tenant_self_checks_check_type ON public.tenant_self_checks(check_type);

ALTER TABLE public.tenant_self_checks ENABLE ROW LEVEL SECURITY;

-- Tenants can view their own checks and create responses
CREATE POLICY "Tenants can view their own self-checks" ON public.tenant_self_checks FOR SELECT
USING (
  tenancy_id IN (
    SELECT id FROM public.tenancies
    WHERE tenant_id = (SELECT id FROM public.people WHERE auth_id = auth.uid())
  )
);

-- Tenants can update responses (response_received_at, tenant_response, issue fields)
CREATE POLICY "Tenants can update their own self-checks" ON public.tenant_self_checks FOR UPDATE
USING (
  tenancy_id IN (
    SELECT id FROM public.tenancies
    WHERE tenant_id = (SELECT id FROM public.people WHERE auth_id = auth.uid())
  )
)
WITH CHECK (
  tenancy_id IN (
    SELECT id FROM public.tenancies
    WHERE tenant_id = (SELECT id FROM public.people WHERE auth_id = auth.uid())
  )
);

-- System can insert checks (for cron jobs)
CREATE POLICY "System can insert self-checks" ON public.tenant_self_checks FOR INSERT
WITH CHECK (true);

-- Admin can view all checks and manage them
CREATE POLICY "Admin can view all self-checks" ON public.tenant_self_checks FOR SELECT
USING ((SELECT role FROM public.people WHERE auth_id = auth.uid()) IN ('administrator', 'admin'));

CREATE POLICY "Admin can manage all self-checks" ON public.tenant_self_checks FOR UPDATE
USING ((SELECT role FROM public.people WHERE auth_id = auth.uid()) IN ('administrator', 'admin'))
WITH CHECK ((SELECT role FROM public.people WHERE auth_id = auth.uid()) IN ('administrator', 'admin'));

-- Populate issue types
INSERT INTO public.tenant_self_check_issues (issue_key, display_name, category) VALUES
  ('door_not_closing', 'Door doesn''t close properly', 'fire_door'),
  ('strike_plate_loose', 'Strike plate is loose', 'fire_door'),
  ('hinges_damaged', 'Hinges are damaged', 'fire_door'),
  ('seal_damaged', 'Door seal is damaged', 'fire_door'),
  ('handle_broken', 'Door handle is broken', 'fire_door'),
  ('battery_low', 'Battery is low', 'smoke_alarm'),
  ('alarm_not_working', 'Alarm doesn''t sound', 'smoke_alarm'),
  ('red_light_off', 'Status light is off', 'smoke_alarm'),
  ('missing', 'Alarm is missing', 'smoke_alarm'),
  ('installed_in_wrong_place', 'Alarm is in wrong location', 'smoke_alarm')
ON CONFLICT (issue_key) DO NOTHING;
