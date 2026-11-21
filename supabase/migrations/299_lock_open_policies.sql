-- 299 · Lock down open policies (21 Nov 2026 safety review). DRAFT — review, then run once with Harry's go-ahead.
-- Safe to run more than once: every policy is dropped first if it already exists.
-- Each change is listed with its reason. The server writes these tables with the service role, which skips these
-- rules, so tightening them doesn't stop the app working.
-- Staff check: a signed-in person whose people.role is an office role, matched by email (people.id is not auth.uid).

-- 1. tenant_self_check_issues: NOT changed. It is the shared list of issue TYPES that tenants read on their safety-check
--    page (app/tenant/safety-checks/page.tsx), not per-tenant results, so signed-in tenants need to read it.

-- 2. audit_logs: any signed-in user could write fake audit entries. Writes go through the server only.
DROP POLICY IF EXISTS "signed-in users write audit_logs" ON public.audit_logs;

-- 3. schema_migrations: the policy allows everything and is not limited to the service role.
DROP POLICY IF EXISTS "schema_migrations_service_only" ON public.schema_migrations;
DROP POLICY IF EXISTS "service role only" ON public.schema_migrations;
CREATE POLICY "service role only" ON public.schema_migrations
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- 4. maintenance_diagnostic_attempts: any signed-in user could add diagnostic records. Server writes only.
DROP POLICY IF EXISTS "signed-in users write diagnostics" ON public.maintenance_diagnostic_attempts;

-- 5. cleaner_task_templates: internal templates, readable by staff and cleaners only.
DROP POLICY IF EXISTS "signed-in users read task templates" ON public.cleaner_task_templates;
DROP POLICY IF EXISTS "staff and cleaners read task templates" ON public.cleaner_task_templates;
CREATE POLICY "staff and cleaners read task templates" ON public.cleaner_task_templates
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.people p WHERE lower(p.email) = lower(auth.email())
           AND p.role IN ('administrator', 'admin', 'lettings', 'cleaner')));

-- Check afterwards: run the same policy query again. The four changes should be gone or limited.
