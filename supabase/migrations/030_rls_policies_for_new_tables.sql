-- Migration 030: RLS policies for compliance_logs, tenant_self_checks, tenant_acknowledgment_notes
--
-- Auth mapping in this codebase: people.email = auth.jwt() ->> 'email'
-- (people.id is NOT the same as auth.uid(); there is no auth_id/user_id column
-- on people. This mapping matches existing policies such as landlord_statements.)
--
-- Tenancies foreign key: tenancies.person_id -> people.id (NOT tenant_id).

-- ============ compliance_logs ============
ALTER TABLE compliance_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS compliance_logs_admin_all ON compliance_logs;
CREATE POLICY compliance_logs_admin_all ON compliance_logs
  FOR ALL TO authenticated
  USING (
    (SELECT role FROM people WHERE email = auth.jwt() ->> 'email')
      IN ('administrator','landlord','admin','cleaner')
  )
  WITH CHECK (
    (SELECT role FROM people WHERE email = auth.jwt() ->> 'email')
      IN ('administrator','landlord','admin','cleaner')
  );

-- ============ tenant_self_checks ============
ALTER TABLE tenant_self_checks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_self_checks_admin_all ON tenant_self_checks;
CREATE POLICY tenant_self_checks_admin_all ON tenant_self_checks
  FOR ALL TO authenticated
  USING (
    (SELECT role FROM people WHERE email = auth.jwt() ->> 'email')
      IN ('administrator','landlord','admin')
  )
  WITH CHECK (
    (SELECT role FROM people WHERE email = auth.jwt() ->> 'email')
      IN ('administrator','landlord','admin')
  );

DROP POLICY IF EXISTS tenant_self_checks_tenant_own ON tenant_self_checks;
CREATE POLICY tenant_self_checks_tenant_own ON tenant_self_checks
  FOR ALL TO authenticated
  USING (
    tenancy_id IN (
      SELECT t.id FROM tenancies t
      JOIN people p ON p.id = t.person_id
      WHERE p.email = auth.jwt() ->> 'email'
    )
  )
  WITH CHECK (
    tenancy_id IN (
      SELECT t.id FROM tenancies t
      JOIN people p ON p.id = t.person_id
      WHERE p.email = auth.jwt() ->> 'email'
    )
  );

-- ============ tenant_acknowledgment_notes ============
ALTER TABLE tenant_acknowledgment_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_ack_notes_admin_all ON tenant_acknowledgment_notes;
CREATE POLICY tenant_ack_notes_admin_all ON tenant_acknowledgment_notes
  FOR ALL TO authenticated
  USING (
    (SELECT role FROM people WHERE email = auth.jwt() ->> 'email')
      IN ('administrator','landlord','admin')
  )
  WITH CHECK (
    (SELECT role FROM people WHERE email = auth.jwt() ->> 'email')
      IN ('administrator','landlord','admin')
  );

DROP POLICY IF EXISTS tenant_ack_notes_tenant_read ON tenant_acknowledgment_notes;
CREATE POLICY tenant_ack_notes_tenant_read ON tenant_acknowledgment_notes
  FOR SELECT TO authenticated
  USING (
    room_id IN (
      SELECT r.id FROM rooms r
      JOIN tenancies t ON t.room_id = r.id
      JOIN people p ON p.id = t.person_id
      WHERE p.email = auth.jwt() ->> 'email'
    )
  );

DROP POLICY IF EXISTS tenant_ack_notes_tenant_ack ON tenant_acknowledgment_notes;
CREATE POLICY tenant_ack_notes_tenant_ack ON tenant_acknowledgment_notes
  FOR UPDATE TO authenticated
  USING (
    room_id IN (
      SELECT r.id FROM rooms r
      JOIN tenancies t ON t.room_id = r.id
      JOIN people p ON p.id = t.person_id
      WHERE p.email = auth.jwt() ->> 'email'
    )
  );
