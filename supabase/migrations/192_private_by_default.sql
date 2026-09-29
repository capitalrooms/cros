-- 192: Private by default — everyone sees only what is theirs; the office sees everything.
--
-- What was wrong (found with cros_policy_report, 28 Sep 2026):
--   • Without signing in, the public app key could read landlord onboarding (AML) forms, viewing visitors, the
--     document inbox, push subscriptions, rooms and more — and change some of them.
--   • Anyone signed in (any tenant, contractor, cleaner or landlord) could read AND change every person's record
--     (including their own role — i.e. make themselves an admin), every tenancy, every property, every job and
--     every landlord's bank details.
-- How it works now (the standard model: least privilege, deny by default):
--   • Not signed in: no table access at all. Public pages go through the server, which checks a token.
--   • Office (administrator, admin, lettings = cros_is_staff()): everything they had before.
--     Landlord bank details: administrators/admins only (cros_is_admin()).
--   • Tenants: themselves, their own tenancy, their house, its rooms and jobs, housemates' first names (via
--     cros_my_housemates) and upcoming viewings without the viewer's details (via cros_my_house_viewings).
--   • Landlords: themselves, their properties and those properties' tenancies (statements were already theirs only).
--   • Contractors: themselves, only the jobs assigned to them, and those jobs' properties/rooms/photos and residents.
--   • Cleaners: themselves, properties and rooms (they work across the portfolio), cleans and jobs they report.
--   • Nobody but an administrator can change anyone's role or email (a trigger, so it holds whatever the policies say).
-- Server routes use the service key and are unaffected. ADDITIVE/REPLACING POLICIES ONLY — no data changes.
-- Idempotent: safe to run more than once.

-- ── Who am I ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cros_me() RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.people WHERE lower(email) = lower(auth.jwt()->>'email') ORDER BY created_at LIMIT 1
$$;
CREATE OR REPLACE FUNCTION public.cros_my_role() RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.people WHERE lower(email) = lower(auth.jwt()->>'email') ORDER BY created_at LIMIT 1
$$;
CREATE OR REPLACE FUNCTION public.cros_is_admin() RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(public.cros_my_role() IN ('administrator', 'admin'), FALSE)
$$;
-- Properties I have a reason to see: where I live (from shortly before move-in to 30 days after leaving),
-- own, have a job, or clean.
CREATE OR REPLACE FUNCTION public.cros_my_property_ids() RETURNS SETOF UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT property_id FROM public.tenancies
   WHERE (person_id = public.cros_me() OR co_tenant_id = public.cros_me())
     AND start_date <= current_date + 60 AND (end_date IS NULL OR end_date >= current_date - 30)
  UNION SELECT id FROM public.properties WHERE landlord_id = public.cros_me()
  UNION SELECT property_id FROM public.maintenance_tickets WHERE contractor_id = public.cros_me() AND property_id IS NOT NULL
  UNION SELECT property_id FROM public.cleans WHERE cleaner_id = public.cros_me() AND property_id IS NOT NULL
$$;
-- Can I see this person's record?
CREATE OR REPLACE FUNCTION public.cros_can_see_person(pid UUID) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.cros_is_staff()
      OR pid = public.cros_me()
      -- the office team (names and contact details are business contacts)
      OR EXISTS (SELECT 1 FROM public.people p WHERE p.id = pid AND p.role IN ('administrator', 'admin', 'lettings'))
      -- people living at a property I live at / own / work at
      OR EXISTS (SELECT 1 FROM public.tenancies t
                  WHERE (t.person_id = pid OR t.co_tenant_id = pid)
                    AND t.property_id IN (SELECT public.cros_my_property_ids())
                    AND (t.end_date IS NULL OR t.end_date >= current_date - 30))
      -- tenants can see the contractor/cleaner coming to their house (never shown to landlords)
      OR (public.cros_my_role() = 'tenant' AND (
            EXISTS (SELECT 1 FROM public.maintenance_tickets m WHERE m.contractor_id = pid AND m.property_id IN (SELECT public.cros_my_property_ids()))
         OR EXISTS (SELECT 1 FROM public.cleans c WHERE c.cleaner_id = pid AND c.property_id IN (SELECT public.cros_my_property_ids()))))
$$;

-- Narrow lookups for the tenant app
CREATE OR REPLACE FUNCTION public.cros_my_housemates()
RETURNS TABLE (person_id UUID, first_name TEXT, room_name TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT ON (t.person_id) t.person_id, p.first_name::TEXT, r.name::TEXT
    FROM public.tenancies t
    JOIN public.people p ON p.id = t.person_id
    LEFT JOIN public.rooms r ON r.id = t.room_id
   WHERE t.property_id IN (SELECT property_id FROM public.tenancies
                            WHERE (person_id = public.cros_me() OR co_tenant_id = public.cros_me())
                              AND start_date <= current_date AND (end_date IS NULL OR end_date >= current_date))
     AND t.start_date <= current_date AND (t.end_date IS NULL OR t.end_date >= current_date)
   ORDER BY t.person_id, t.start_date DESC
$$;
CREATE OR REPLACE FUNCTION public.cros_my_house_viewings()
RETURNS TABLE (id UUID, viewing_date DATE, viewing_slot TEXT, room_id UUID, viewing_status TEXT, rooms JSONB)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT v.id, v.viewing_date::DATE, v.viewing_slot::TEXT, v.room_id, v.viewing_status::TEXT,
         jsonb_build_object('name', r.name, 'property_id', r.property_id)
    FROM public.viewings v JOIN public.rooms r ON r.id = v.room_id
   WHERE r.property_id IN (SELECT property_id FROM public.tenancies
                            WHERE (person_id = public.cros_me() OR co_tenant_id = public.cros_me())
                              AND start_date <= current_date AND (end_date IS NULL OR end_date >= current_date))
     AND v.viewing_status = 'scheduled' AND v.viewing_date >= current_date
   ORDER BY v.viewing_date, v.viewing_slot
$$;
REVOKE ALL ON FUNCTION public.cros_my_housemates() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cros_my_house_viewings() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cros_my_housemates() TO authenticated;
GRANT EXECUTE ON FUNCTION public.cros_my_house_viewings() TO authenticated;

-- ── Not signed in: no table access ───────────────────────────────────────────
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;

-- ── Helper: replace a table's policies ───────────────────────────────────────
CREATE OR REPLACE FUNCTION pg_temp.drop_policy(tbl TEXT, pol TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol, tbl); END $$;
CREATE OR REPLACE FUNCTION pg_temp.policy(tbl TEXT, pol TEXT, ddl TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol, tbl);
  EXECUTE ddl;
END $$;

-- The open policies found by the report
SELECT pg_temp.drop_policy(t, p) FROM (VALUES
  ('admin_appointments', 'anyone_can_read_admin_appointments'), ('admin_appointments', 'authenticated_can_delete_admin_appointments'),
  ('admin_appointments', 'authenticated_can_insert_admin_appointments'), ('admin_appointments', 'authenticated_can_update_admin_appointments'),
  ('attachments', 'authenticated_access'), ('cleans', 'authenticated_access'), ('inbox_documents', 'inbox all'),
  ('landlord_bank_accounts', 'landlord_bank_accounts_admin'), ('landlord_onboarding', 'landlord_onboarding_public_submit'),
  ('landlord_onboarding', 'landlord_onboarding_public_token'), ('leads', 'leads all'),
  ('let_only_contacts', 'let_only_contacts_admin_lettings'), ('let_only_listings', 'let_only_listings_admin_lettings'),
  ('let_only_rooms', 'let_only_rooms_admin_lettings'), ('maintenance_tickets', 'authenticated_access'),
  ('notifications', 'service_can_insert_notifications'), ('offers', 'authenticated_access'), ('passkeys', 'passkeys_select_for_auth'),
  ('payment_audit_log', 'system_insert_audit_log'), ('people', 'authenticated_access'), ('portfolio_snapshots', 'admins read snapshots'),
  ('properties', 'authenticated_access'), ('property_data_corrections', 'property_data_corrections_admin_all'),
  ('property_extended_details', 'property_extended_details_admin_all'), ('property_notes', 'property_notes all'),
  ('property_policies', 'admin_full_access_property_policies'), ('push_subscriptions', 'push_subs_all'),
  ('rooms', 'anyone_can_read_rooms'), ('tenancies', 'authenticated_access'), ('viewings', 'anyone_can_read_viewings'),
  ('viewings', 'authenticated_can_insert_viewings'), ('viewings', 'authenticated_can_update_viewings'),
  ('visit_appointments', 'authenticated_access'), ('visit_tenant_requests', 'authenticated_read'),
  ('visit_tenant_requests', 'service_update'), ('visit_tenant_requests', 'tenant_insert_own'), ('visits', 'authenticated_access')
) AS x(t, p);

-- Office-only tables: staff do everything; nobody else
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['admin_appointments', 'inbox_documents', 'leads', 'let_only_contacts', 'let_only_listings', 'let_only_rooms',
    'offers', 'portfolio_snapshots', 'property_data_corrections', 'property_extended_details', 'property_notes', 'property_policies',
    'push_subscriptions', 'visit_appointments', 'visit_tenant_requests', 'visits', 'viewings', 'payment_audit_log'] LOOP
    PERFORM pg_temp.policy(t, 'office manages ' || t,
      format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.cros_is_staff()) WITH CHECK (public.cros_is_staff())', 'office manages ' || t, t));
  END LOOP;
END $$;

-- Landlord bank details: administrators only
SELECT pg_temp.policy('landlord_bank_accounts', 'admins manage bank accounts',
  $p$CREATE POLICY "admins manage bank accounts" ON public.landlord_bank_accounts FOR ALL TO authenticated USING (public.cros_is_admin()) WITH CHECK (public.cros_is_admin())$p$);

-- People
SELECT pg_temp.policy('people', 'people read what they should',
  $p$CREATE POLICY "people read what they should" ON public.people FOR SELECT TO authenticated USING (public.cros_can_see_person(id))$p$);
SELECT pg_temp.policy('people', 'people update themselves; office updates anyone',
  $p$CREATE POLICY "people update themselves; office updates anyone" ON public.people FOR UPDATE TO authenticated
     USING (public.cros_is_staff() OR id = public.cros_me()) WITH CHECK (public.cros_is_staff() OR id = public.cros_me())$p$);
SELECT pg_temp.policy('people', 'office adds people',
  $p$CREATE POLICY "office adds people" ON public.people FOR INSERT TO authenticated WITH CHECK (public.cros_is_staff())$p$);
SELECT pg_temp.policy('people', 'office removes people',
  $p$CREATE POLICY "office removes people" ON public.people FOR DELETE TO authenticated USING (public.cros_is_staff())$p$);

-- Only an administrator (or the server) may change anyone's role or email
CREATE OR REPLACE FUNCTION public.cros_people_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF COALESCE(auth.jwt()->>'role', '') = 'authenticated' AND NOT public.cros_is_admin()
     AND (NEW.role IS DISTINCT FROM OLD.role OR lower(NEW.email) IS DISTINCT FROM lower(OLD.email)) THEN
    RAISE EXCEPTION 'Only an administrator can change someone''s role or email address.';
  END IF;
  RETURN NEW;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'people_role_email_guard') THEN
    CREATE TRIGGER people_role_email_guard BEFORE UPDATE ON public.people FOR EACH ROW EXECUTE FUNCTION public.cros_people_guard();
  END IF;
END $$;

-- Tenancies: my own, my properties' (landlord), and the office
SELECT pg_temp.policy('tenancies', 'tenancies read by the tenant, landlord and office',
  $p$CREATE POLICY "tenancies read by the tenant, landlord and office" ON public.tenancies FOR SELECT TO authenticated
     USING (public.cros_is_staff() OR person_id = public.cros_me() OR co_tenant_id = public.cros_me()
            OR property_id IN (SELECT id FROM public.properties WHERE landlord_id = public.cros_me()))$p$);
SELECT pg_temp.policy('tenancies', 'office manages tenancies',
  $p$CREATE POLICY "office manages tenancies" ON public.tenancies FOR ALL TO authenticated USING (public.cros_is_staff()) WITH CHECK (public.cros_is_staff())$p$);

-- Properties and rooms: the ones I have a reason to see (cleaners work across the portfolio)
SELECT pg_temp.policy('properties', 'properties read by those connected to them',
  $p$CREATE POLICY "properties read by those connected to them" ON public.properties FOR SELECT TO authenticated
     USING (public.cros_is_staff() OR public.cros_my_role() = 'cleaner' OR id IN (SELECT public.cros_my_property_ids()))$p$);
SELECT pg_temp.policy('properties', 'office manages properties',
  $p$CREATE POLICY "office manages properties" ON public.properties FOR ALL TO authenticated USING (public.cros_is_staff()) WITH CHECK (public.cros_is_staff())$p$);
SELECT pg_temp.policy('rooms', 'rooms read by those connected to them',
  $p$CREATE POLICY "rooms read by those connected to them" ON public.rooms FOR SELECT TO authenticated
     USING (public.cros_is_staff() OR public.cros_my_role() = 'cleaner' OR property_id IN (SELECT public.cros_my_property_ids()))$p$);

-- Maintenance jobs
SELECT pg_temp.policy('maintenance_tickets', 'jobs read by those connected to them',
  $p$CREATE POLICY "jobs read by those connected to them" ON public.maintenance_tickets FOR SELECT TO authenticated
     USING (public.cros_is_staff() OR contractor_id = public.cros_me() OR reporter_id IN (auth.uid(), public.cros_me())
            OR (public.cros_my_role() IN ('tenant', 'landlord') AND property_id IN (SELECT public.cros_my_property_ids())))$p$);
SELECT pg_temp.policy('maintenance_tickets', 'jobs reported by tenants, cleaners and office',
  $p$CREATE POLICY "jobs reported by tenants, cleaners and office" ON public.maintenance_tickets FOR INSERT TO authenticated
     WITH CHECK (public.cros_is_staff() OR public.cros_my_role() = 'cleaner' OR property_id IN (SELECT public.cros_my_property_ids()))$p$);
SELECT pg_temp.policy('maintenance_tickets', 'jobs updated by the contractor, the house and office',
  $p$CREATE POLICY "jobs updated by the contractor, the house and office" ON public.maintenance_tickets FOR UPDATE TO authenticated
     USING (public.cros_is_staff() OR contractor_id = public.cros_me()
            OR (public.cros_my_role() = 'tenant' AND property_id IN (SELECT public.cros_my_property_ids())))
     WITH CHECK (public.cros_is_staff() OR contractor_id = public.cros_me()
            OR (public.cros_my_role() = 'tenant' AND property_id IN (SELECT public.cros_my_property_ids())))$p$);
SELECT pg_temp.policy('maintenance_tickets', 'office removes jobs',
  $p$CREATE POLICY "office removes jobs" ON public.maintenance_tickets FOR DELETE TO authenticated USING (public.cros_is_staff())$p$);

-- Photos/files on jobs: whoever can see the job
SELECT pg_temp.policy('attachments', 'job files for those who can see the job',
  $p$CREATE POLICY "job files for those who can see the job" ON public.attachments FOR ALL TO authenticated
     USING (public.cros_is_staff() OR ticket_id IN (SELECT id FROM public.maintenance_tickets))
     WITH CHECK (public.cros_is_staff() OR ticket_id IN (SELECT id FROM public.maintenance_tickets))$p$);

-- Cleans
SELECT pg_temp.policy('cleans', 'cleans read by the cleaner, the house and office',
  $p$CREATE POLICY "cleans read by the cleaner, the house and office" ON public.cleans FOR SELECT TO authenticated
     USING (public.cros_is_staff() OR public.cros_my_role() = 'cleaner' OR cleaner_id = public.cros_me()
            OR property_id IN (SELECT public.cros_my_property_ids()))$p$);
SELECT pg_temp.policy('cleans', 'cleans managed by cleaners and office',
  $p$CREATE POLICY "cleans managed by cleaners and office" ON public.cleans FOR INSERT TO authenticated
     WITH CHECK (public.cros_is_staff() OR public.cros_my_role() = 'cleaner')$p$);
SELECT pg_temp.policy('cleans', 'cleans updated by cleaners and office',
  $p$CREATE POLICY "cleans updated by cleaners and office" ON public.cleans FOR UPDATE TO authenticated
     USING (public.cros_is_staff() OR public.cros_my_role() = 'cleaner') WITH CHECK (public.cros_is_staff() OR public.cros_my_role() = 'cleaner')$p$);
SELECT pg_temp.policy('cleans', 'office removes cleans',
  $p$CREATE POLICY "office removes cleans" ON public.cleans FOR DELETE TO authenticated USING (public.cros_is_staff())$p$);

-- Notifications: anyone signed in may notify the office or themselves; the office may notify anyone
SELECT pg_temp.policy('notifications', 'notify the office or yourself',
  $p$CREATE POLICY "notify the office or yourself" ON public.notifications FOR INSERT TO authenticated
     WITH CHECK (public.cros_is_staff() OR user_id = public.cros_me()
                 OR user_id IN (SELECT id FROM public.people WHERE role IN ('administrator', 'admin', 'lettings')))$p$);
