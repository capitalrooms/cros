-- 235 — Who may change a job or a clean (21 Oct 2026, tenant / contractor / cleaner app audit).
--   • maintenance_tickets: a tenant could change ANY detail of any job at their house (status, price, contractor…)
--     straight from the app. Tenants' changes now all go through the server (short-notice answers, visit add-ons),
--     so they no longer change jobs directly. The office and the job's own contractor are unchanged.
--   • cleans: any cleaner could change any clean, anyone's. Now a cleaner changes their own (or an unassigned one).
-- Reading and adding are unchanged. REPLACING POLICIES ONLY — no data changes. Idempotent: safe to run more than once.
DROP POLICY IF EXISTS "jobs updated by the contractor, the house and office" ON public.maintenance_tickets;
DROP POLICY IF EXISTS "jobs updated by the contractor and office" ON public.maintenance_tickets;
CREATE POLICY "jobs updated by the contractor and office" ON public.maintenance_tickets FOR UPDATE TO authenticated
  USING ((SELECT public.cros_is_staff()) OR contractor_id = (SELECT public.cros_me()))
  WITH CHECK ((SELECT public.cros_is_staff()) OR contractor_id = (SELECT public.cros_me()));

DROP POLICY IF EXISTS "cleans updated by cleaners and office" ON public.cleans;
DROP POLICY IF EXISTS "cleans updated by their cleaner and office" ON public.cleans;
CREATE POLICY "cleans updated by their cleaner and office" ON public.cleans FOR UPDATE TO authenticated
  USING ((SELECT public.cros_is_staff()) OR ((SELECT public.cros_my_role()) = 'cleaner' AND (cleaner_id IS NULL OR cleaner_id = (SELECT public.cros_me()))))
  WITH CHECK ((SELECT public.cros_is_staff()) OR ((SELECT public.cros_my_role()) = 'cleaner' AND cleaner_id = (SELECT public.cros_me())));
