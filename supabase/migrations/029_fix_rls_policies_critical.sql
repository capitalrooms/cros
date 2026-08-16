-- CRITICAL: Fix Row Level Security (RLS) Policies
-- Current: Permissive (allow all) - ❌ DANGEROUS
-- New: Restrictive (least privilege) - ✅ SECURE

-- ============================================================
-- PEOPLE TABLE - Admin only
-- ============================================================
DROP POLICY IF EXISTS "anyone_can_read_people" ON public.people;
DROP POLICY IF EXISTS "authenticated_can_insert_people" ON public.people;
DROP POLICY IF EXISTS "authenticated_can_update_people" ON public.people;

CREATE POLICY "admin_only_read_people" ON public.people
  FOR SELECT USING (
    auth.uid() = id
    OR EXISTS(
      SELECT 1 FROM people WHERE people.id = auth.uid() AND people.role = 'administrator'
    )
  );

CREATE POLICY "admin_only_update_people" ON public.people
  FOR UPDATE USING (
    auth.uid() = id
    OR EXISTS(
      SELECT 1 FROM people WHERE people.id = auth.uid() AND people.role = 'administrator'
    )
  );

-- ============================================================
-- PROPERTIES TABLE - Admin, Lettings can read; others based on role
-- ============================================================
DROP POLICY IF EXISTS "anyone_can_read_properties" ON public.properties;
DROP POLICY IF EXISTS "authenticated_can_insert_properties" ON public.properties;
DROP POLICY IF EXISTS "authenticated_can_update_properties" ON public.properties;

CREATE POLICY "read_properties_if_admin_lettings_cleaner" ON public.properties
  FOR SELECT USING (
    EXISTS(
      SELECT 1 FROM people
      WHERE people.id = auth.uid()
      AND people.role IN ('administrator', 'lettings', 'cleaner', 'landlord')
    )
  );

-- Only admin can insert/update/delete properties
CREATE POLICY "admin_only_write_properties" ON public.properties
  FOR INSERT WITH CHECK (
    EXISTS(
      SELECT 1 FROM people WHERE people.id = auth.uid() AND people.role = 'administrator'
    )
  );

CREATE POLICY "admin_only_update_properties" ON public.properties
  FOR UPDATE USING (
    EXISTS(
      SELECT 1 FROM people WHERE people.id = auth.uid() AND people.role = 'administrator'
    )
  );

-- ============================================================
-- ROOMS TABLE - Similar to properties
-- ============================================================
DROP POLICY IF EXISTS "anyone_can_read_rooms" ON public.rooms;
DROP POLICY IF EXISTS "authenticated_can_insert_rooms" ON public.rooms;
DROP POLICY IF EXISTS "authenticated_can_update_rooms" ON public.rooms;

CREATE POLICY "read_rooms_if_admin_lettings_cleaner" ON public.rooms
  FOR SELECT USING (
    EXISTS(
      SELECT 1 FROM people
      WHERE people.id = auth.uid()
      AND people.role IN ('administrator', 'lettings', 'cleaner', 'landlord')
    )
  );

CREATE POLICY "admin_only_write_rooms" ON public.rooms
  FOR INSERT WITH CHECK (
    EXISTS(
      SELECT 1 FROM people WHERE people.id = auth.uid() AND people.role = 'administrator'
    )
  );

-- ============================================================
-- VIEWINGS TABLE - Admin & Lettings only
-- ============================================================
DROP POLICY IF EXISTS "anyone_can_read_viewings" ON public.viewings;
DROP POLICY IF EXISTS "authenticated_can_insert_viewings" ON public.viewings;
DROP POLICY IF EXISTS "authenticated_can_update_viewings" ON public.viewings;

CREATE POLICY "read_viewings_if_admin_or_lettings" ON public.viewings
  FOR SELECT USING (
    EXISTS(
      SELECT 1 FROM people
      WHERE people.id = auth.uid()
      AND people.role IN ('administrator', 'lettings')
    )
  );

CREATE POLICY "admin_lettings_insert_viewings" ON public.viewings
  FOR INSERT WITH CHECK (
    EXISTS(
      SELECT 1 FROM people
      WHERE people.id = auth.uid()
      AND people.role IN ('administrator', 'lettings')
    )
  );

CREATE POLICY "admin_lettings_update_viewings" ON public.viewings
  FOR UPDATE USING (
    EXISTS(
      SELECT 1 FROM people
      WHERE people.id = auth.uid()
      AND people.role IN ('administrator', 'lettings')
    )
  );

-- ============================================================
-- MAINTENANCE_TICKETS TABLE - Role-based access
-- ============================================================
DROP POLICY IF EXISTS "anyone_can_read_maintenance_tickets" ON public.maintenance_tickets;
DROP POLICY IF EXISTS "authenticated_can_insert_maintenance_tickets" ON public.maintenance_tickets;
DROP POLICY IF EXISTS "authenticated_can_update_maintenance_tickets" ON public.maintenance_tickets;

CREATE POLICY "read_maintenance_tickets" ON public.maintenance_tickets
  FOR SELECT USING (
    -- Reporter (tenant) can see own ticket
    reporter_id = auth.uid()
    OR
    -- Contractor can see own jobs
    contractor_id = auth.uid()
    OR
    -- Admin can see all
    EXISTS(
      SELECT 1 FROM people
      WHERE people.id = auth.uid()
      AND people.role = 'administrator'
    )
  );

CREATE POLICY "reporter_can_insert_tickets" ON public.maintenance_tickets
  FOR INSERT WITH CHECK (
    reporter_id = auth.uid()
    OR EXISTS(
      SELECT 1 FROM people
      WHERE people.id = auth.uid()
      AND people.role = 'administrator'
    )
  );

CREATE POLICY "contractor_admin_update_tickets" ON public.maintenance_tickets
  FOR UPDATE USING (
    contractor_id = auth.uid()
    OR EXISTS(
      SELECT 1 FROM people
      WHERE people.id = auth.uid()
      AND people.role = 'administrator'
    )
  );

-- ============================================================
-- CLEANS TABLE - Cleaner, Admin access
-- ============================================================
DROP POLICY IF EXISTS "anyone_can_read_cleans" ON public.cleans;
DROP POLICY IF EXISTS "authenticated_can_insert_cleans" ON public.cleans;
DROP POLICY IF EXISTS "authenticated_can_update_cleans" ON public.cleans;

CREATE POLICY "read_cleans_if_cleaner_admin" ON public.cleans
  FOR SELECT USING (
    -- Cleaner can see own cleans
    cleaner_id = auth.uid()
    OR
    -- Admin can see all
    EXISTS(
      SELECT 1 FROM people
      WHERE people.id = auth.uid()
      AND people.role = 'administrator'
    )
  );

CREATE POLICY "cleaner_admin_insert_cleans" ON public.cleans
  FOR INSERT WITH CHECK (
    EXISTS(
      SELECT 1 FROM people
      WHERE people.id = auth.uid()
      AND people.role IN ('cleaner', 'administrator')
    )
  );

CREATE POLICY "cleaner_admin_update_cleans" ON public.cleans
  FOR UPDATE USING (
    cleaner_id = auth.uid()
    OR EXISTS(
      SELECT 1 FROM people
      WHERE people.id = auth.uid()
      AND people.role = 'administrator'
    )
  );

-- ============================================================
-- TENANCIES TABLE - Tenant, Admin access only
-- ============================================================
DROP POLICY IF EXISTS "anyone_can_read_tenancies" ON public.tenancies;
DROP POLICY IF EXISTS "authenticated_can_insert_tenancies" ON public.tenancies;
DROP POLICY IF EXISTS "authenticated_can_update_tenancies" ON public.tenancies;

CREATE POLICY "read_own_tenancy" ON public.tenancies
  FOR SELECT USING (
    -- Tenant can see own tenancy
    tenant_id = auth.uid()
    OR
    -- Admin can see all
    EXISTS(
      SELECT 1 FROM people
      WHERE people.id = auth.uid()
      AND people.role = 'administrator'
    )
  );

CREATE POLICY "admin_only_manage_tenancies" ON public.tenancies
  FOR INSERT WITH CHECK (
    EXISTS(
      SELECT 1 FROM people
      WHERE people.id = auth.uid()
      AND people.role = 'administrator'
    )
  );

-- ============================================================
-- PROPERTY_NOTES TABLE - Admin writes, relevant users read
-- ============================================================
DROP POLICY IF EXISTS "anyone_can_read_property_notes" ON public.property_notes;
DROP POLICY IF EXISTS "authenticated_can_insert_property_notes" ON public.property_notes;

CREATE POLICY "read_property_notes_if_admin_or_tenant_in_property" ON public.property_notes
  FOR SELECT USING (
    -- Admin can read all
    EXISTS(
      SELECT 1 FROM people
      WHERE people.id = auth.uid()
      AND people.role = 'administrator'
    )
    OR
    -- Cleaner can read
    EXISTS(
      SELECT 1 FROM people
      WHERE people.id = auth.uid()
      AND people.role = 'cleaner'
    )
    OR
    -- Tenant can read notes for their property
    (
      note_type = 'admin' OR note_type = 'agent'
    )
    AND EXISTS(
      SELECT 1 FROM tenancies t
      WHERE t.tenant_id = auth.uid()
      AND (
        t.room_id = property_notes.room_id
        OR property_notes.room_id IS NULL  -- Whole house
      )
    )
  );

CREATE POLICY "admin_only_write_property_notes" ON public.property_notes
  FOR INSERT WITH CHECK (
    EXISTS(
      SELECT 1 FROM people
      WHERE people.id = auth.uid()
      AND people.role = 'administrator'
    )
  );

-- ============================================================
-- COMPLIANCE_LOGS TABLE - Admin, Cleaner access
-- ============================================================
DROP POLICY IF EXISTS "anyone_can_read_compliance_logs" ON public.compliance_logs;
DROP POLICY IF EXISTS "authenticated_can_insert_compliance_logs" ON public.compliance_logs;

CREATE POLICY "read_compliance_logs_if_admin_cleaner" ON public.compliance_logs
  FOR SELECT USING (
    EXISTS(
      SELECT 1 FROM people
      WHERE people.id = auth.uid()
      AND people.role IN ('administrator', 'cleaner')
    )
  );

CREATE POLICY "admin_cleaner_insert_compliance_logs" ON public.compliance_logs
  FOR INSERT WITH CHECK (
    EXISTS(
      SELECT 1 FROM people
      WHERE people.id = auth.uid()
      AND people.role IN ('administrator', 'cleaner')
    )
  );

-- ============================================================
-- PENDING_CLEANER_NOTES TABLE - Admin only
-- ============================================================
DROP POLICY IF EXISTS "anyone_can_read_pending_cleaner_notes" ON public.pending_cleaner_notes;
DROP POLICY IF EXISTS "authenticated_can_insert_pending_cleaner_notes" ON public.pending_cleaner_notes;

CREATE POLICY "admin_only_read_pending_notes" ON public.pending_cleaner_notes
  FOR SELECT USING (
    EXISTS(
      SELECT 1 FROM people
      WHERE people.id = auth.uid()
      AND people.role = 'administrator'
    )
  );

CREATE POLICY "admin_only_write_pending_notes" ON public.pending_cleaner_notes
  FOR INSERT WITH CHECK (
    EXISTS(
      SELECT 1 FROM people
      WHERE people.id = auth.uid()
      AND people.role = 'administrator'
    )
  );

-- ============================================================
-- TENANT_SELF_CHECKS TABLE - Tenant, Admin access
-- ============================================================
DROP POLICY IF EXISTS "anyone_can_read_tenant_self_checks" ON public.tenant_self_checks;
DROP POLICY IF EXISTS "authenticated_can_insert_tenant_self_checks" ON public.tenant_self_checks;

CREATE POLICY "read_tenant_self_checks" ON public.tenant_self_checks
  FOR SELECT USING (
    -- Tenant can see own checks
    EXISTS(
      SELECT 1 FROM tenancies
      WHERE tenancies.tenancy_id = tenant_self_checks.tenancy_id
      AND tenancies.tenant_id = auth.uid()
    )
    OR
    -- Admin can see all
    EXISTS(
      SELECT 1 FROM people
      WHERE people.id = auth.uid()
      AND people.role = 'administrator'
    )
  );

CREATE POLICY "tenant_admin_insert_self_checks" ON public.tenant_self_checks
  FOR INSERT WITH CHECK (
    -- Tenant can create own checks
    EXISTS(
      SELECT 1 FROM tenancies
      WHERE tenancies.tenancy_id = tenant_self_checks.tenancy_id
      AND tenancies.tenant_id = auth.uid()
    )
    OR
    -- Admin can create for anyone
    EXISTS(
      SELECT 1 FROM people
      WHERE people.id = auth.uid()
      AND people.role = 'administrator'
    )
  );

-- ============================================================
-- TENANT_ACKNOWLEDGMENT_NOTES TABLE - Tenant, Admin access
-- ============================================================
DROP POLICY IF EXISTS "anyone_can_read_tenant_ack_notes" ON public.tenant_acknowledgment_notes;
DROP POLICY IF EXISTS "authenticated_can_insert_tenant_ack_notes" ON public.tenant_acknowledgment_notes;

CREATE POLICY "read_tenant_ack_notes" ON public.tenant_acknowledgment_notes
  FOR SELECT USING (
    -- Tenant can see active notes for them (not internal notes in SELECT)
    EXISTS(
      SELECT 1 FROM tenancies
      WHERE tenancies.tenancy_id = tenant_acknowledgment_notes.tenancy_id
      AND tenancies.tenant_id = auth.uid()
      AND tenant_acknowledgment_notes.status IN ('active', 'acknowledged')
    )
    OR
    -- Admin can see all (including internal notes)
    EXISTS(
      SELECT 1 FROM people
      WHERE people.id = auth.uid()
      AND people.role = 'administrator'
    )
  );

CREATE POLICY "admin_only_write_ack_notes" ON public.tenant_acknowledgment_notes
  FOR INSERT WITH CHECK (
    EXISTS(
      SELECT 1 FROM people
      WHERE people.id = auth.uid()
      AND people.role = 'administrator'
    )
  );

-- ============================================================
-- NOTIFICATIONS TABLE - User sees own, Admin sees all
-- ============================================================
DROP POLICY IF EXISTS "anyone_can_read_notifications" ON public.notifications;

CREATE POLICY "read_own_notifications" ON public.notifications
  FOR SELECT USING (
    user_id = auth.uid()
    OR EXISTS(
      SELECT 1 FROM people
      WHERE people.id = auth.uid()
      AND people.role = 'administrator'
    )
  );
