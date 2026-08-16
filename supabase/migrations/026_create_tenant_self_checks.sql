-- Create tenant self-check logs for fire door and smoke alarm checks
CREATE TABLE IF NOT EXISTS tenant_self_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenancy_id UUID NOT NULL REFERENCES tenancies(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  check_type VARCHAR(50) NOT NULL CHECK (check_type IN ('fire_door', 'smoke_alarm')),
  frequency VARCHAR(50) NOT NULL CHECK (frequency IN ('monthly', 'quarterly')),
  request_sent_at TIMESTAMP WITH TIME ZONE NOT NULL,
  response_received_at TIMESTAMP WITH TIME ZONE,
  tenant_response VARCHAR(50) CHECK (tenant_response IN ('confirmed_ok', 'issue_reported', 'no_response')),
  issue_type VARCHAR(255),
  issue_description TEXT,
  photo_attachment_id UUID REFERENCES attachments(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tenant_self_checks_tenancy_id ON tenant_self_checks(tenancy_id);
CREATE INDEX IF NOT EXISTS idx_tenant_self_checks_property_id ON tenant_self_checks(property_id);
CREATE INDEX IF NOT EXISTS idx_tenant_self_checks_check_type ON tenant_self_checks(check_type);
CREATE INDEX IF NOT EXISTS idx_tenant_self_checks_response ON tenant_self_checks(response_received_at);

-- RLS
ALTER TABLE tenant_self_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_self_checks_tenant_read" ON tenant_self_checks
  FOR SELECT
  USING (
    auth.uid() IN (
      SELECT people.user_id FROM people
      INNER JOIN tenancies ON people.id = tenancies.tenant_id
      WHERE tenancies.id = tenant_self_checks.tenancy_id
    )
  );

CREATE POLICY "tenant_self_checks_admin_all" ON tenant_self_checks
  FOR ALL
  USING (
    (SELECT assignment->>'role' FROM people WHERE user_id = auth.uid()) IN ('administrator', 'landlord', 'admin')
  );

CREATE POLICY "tenant_self_checks_tenant_update_own" ON tenant_self_checks
  FOR UPDATE
  USING (
    auth.uid() IN (
      SELECT people.user_id FROM people
      INNER JOIN tenancies ON people.id = tenancies.tenant_id
      WHERE tenancies.id = tenant_self_checks.tenancy_id
    )
  );
