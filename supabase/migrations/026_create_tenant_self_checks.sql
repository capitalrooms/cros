-- Create Tenant Self-Check Tables
-- Monthly/quarterly fire door and smoke alarm self-checks by tenants
-- Includes issue reporting and photo evidence

-- 1. Create tenant_self_check_issues lookup table
CREATE TABLE IF NOT EXISTS public.tenant_self_check_issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_key VARCHAR(50) NOT NULL UNIQUE, -- 'door_not_closing', 'battery_low', etc.
  display_name VARCHAR(255) NOT NULL,
  category VARCHAR(50) NOT NULL, -- 'fire_door' or 'smoke_alarm'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Create tenant_self_checks log table
CREATE TABLE IF NOT EXISTS public.tenant_self_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenancy_id UUID NOT NULL REFERENCES public.tenancies(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  check_type VARCHAR(50) NOT NULL, -- 'fire_door' or 'smoke_alarm'
  frequency VARCHAR(50) NOT NULL, -- 'monthly' or 'quarterly'
  request_sent_at TIMESTAMP WITH TIME ZONE NOT NULL,
  response_received_at TIMESTAMP WITH TIME ZONE,
  tenant_response VARCHAR(50), -- 'confirmed_ok', 'issue_reported', 'no_response', 'dismissed'
  issue_key VARCHAR(50) REFERENCES public.tenant_self_check_issues(issue_key),
  issue_description TEXT,
  photo_attachment_id UUID REFERENCES public.attachments(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_tenant_self_checks_tenancy_id
  ON public.tenant_self_checks(tenancy_id);
CREATE INDEX IF NOT EXISTS idx_tenant_self_checks_property_id
  ON public.tenant_self_checks(property_id);
CREATE INDEX IF NOT EXISTS idx_tenant_self_checks_room_id
  ON public.tenant_self_checks(room_id);
CREATE INDEX IF NOT EXISTS idx_tenant_self_checks_check_type
  ON public.tenant_self_checks(check_type);
CREATE INDEX IF NOT EXISTS idx_tenant_self_checks_response
  ON public.tenant_self_checks(tenant_response);
CREATE INDEX IF NOT EXISTS idx_tenant_self_checks_request_sent
  ON public.tenant_self_checks(request_sent_at DESC);

-- 4. Enable RLS
ALTER TABLE public.tenant_self_check_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_self_checks ENABLE ROW LEVEL SECURITY;

-- 5. Create RLS policies for development/testing
CREATE POLICY "anyone_can_read_self_check_issues" ON public.tenant_self_check_issues
  FOR SELECT USING (true);

CREATE POLICY "authenticated_can_insert_self_check_issues" ON public.tenant_self_check_issues
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "anyone_can_read_tenant_self_checks" ON public.tenant_self_checks
  FOR SELECT USING (true);

CREATE POLICY "authenticated_can_insert_tenant_self_checks" ON public.tenant_self_checks
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "authenticated_can_update_tenant_self_checks" ON public.tenant_self_checks
  FOR UPDATE USING (auth.role() = 'authenticated');

-- 6. Add constraints
ALTER TABLE public.tenant_self_checks
DROP CONSTRAINT IF EXISTS tenant_self_checks_check_type_check;

ALTER TABLE public.tenant_self_checks
ADD CONSTRAINT tenant_self_checks_check_type_check
CHECK (check_type IN ('fire_door', 'smoke_alarm'));

ALTER TABLE public.tenant_self_checks
DROP CONSTRAINT IF EXISTS tenant_self_checks_frequency_check;

ALTER TABLE public.tenant_self_checks
ADD CONSTRAINT tenant_self_checks_frequency_check
CHECK (frequency IN ('monthly', 'quarterly'));

ALTER TABLE public.tenant_self_checks
DROP CONSTRAINT IF EXISTS tenant_self_checks_response_check;

ALTER TABLE public.tenant_self_checks
ADD CONSTRAINT tenant_self_checks_response_check
CHECK (tenant_response IN ('confirmed_ok', 'issue_reported', 'no_response', 'dismissed'));

-- 7. Populate initial issue types
INSERT INTO public.tenant_self_check_issues (issue_key, display_name, category)
VALUES
  ('door_not_closing', 'Door not closing properly', 'fire_door'),
  ('door_not_latching', 'Door not latching securely', 'fire_door'),
  ('strike_plate_loose', 'Strike plate loose', 'fire_door'),
  ('handle_broken', 'Handle broken', 'fire_door'),
  ('battery_low', 'Battery low or not working', 'smoke_alarm'),
  ('alarm_not_responding', 'Alarm not responding to test', 'smoke_alarm'),
  ('battery_missing', 'Battery missing', 'smoke_alarm'),
  ('alarm_damaged', 'Alarm appears damaged', 'smoke_alarm')
ON CONFLICT (issue_key) DO NOTHING;
