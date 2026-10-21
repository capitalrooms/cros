-- 233 — Role apps privacy (21 Oct 2026, tenant / contractor / cleaner app audit).
--
-- Found with cros_policy_report: six older tables still used the pre-192 rule "the role is administrator, admin or
-- LANDLORD (or cleaner)", so ANY landlord account could read, change and delete every house's records, and cleaners
-- could change or delete any compliance log:
--   compliance_logs, purchases, pending_cleaner_notes, tenant_self_checks, tenant_icebreakers, tenant_acknowledgment_notes
-- and tenant_icebreakers' "shared with housemates" answers were readable by anyone signed in, in every house.
-- The landlord app never reads these tables, so nothing a landlord uses changes.
--
-- Now (the same model as migration 192): the office (cros_is_staff: administrator, admin, lettings) manages them;
--   • cleaners read compliance logs (they work across the portfolio) and add their own — no edits or deletes;
--   • tenants keep their own self-checks, acknowledgment notes and icebreaker, and read housemates' shared answers
--     only (people living at a house they live at);
--   • the job completion log and SMS confirmations can only be written as yourself / by the office.
-- REPLACING POLICIES ONLY — no data changes. Idempotent: safe to run more than once.

-- the office manages each table
DROP POLICY IF EXISTS compliance_logs_admin_all ON public.compliance_logs;
DROP POLICY IF EXISTS "office manages compliance_logs" ON public.compliance_logs;
CREATE POLICY "office manages compliance_logs" ON public.compliance_logs FOR ALL TO authenticated
  USING ((SELECT public.cros_is_staff())) WITH CHECK ((SELECT public.cros_is_staff()));

DROP POLICY IF EXISTS purchases_admin_all ON public.purchases;
DROP POLICY IF EXISTS "office manages purchases" ON public.purchases;
CREATE POLICY "office manages purchases" ON public.purchases FOR ALL TO authenticated
  USING ((SELECT public.cros_is_staff())) WITH CHECK ((SELECT public.cros_is_staff()));

DROP POLICY IF EXISTS pending_cleaner_notes_admin_all ON public.pending_cleaner_notes;
DROP POLICY IF EXISTS "office manages pending_cleaner_notes" ON public.pending_cleaner_notes;
CREATE POLICY "office manages pending_cleaner_notes" ON public.pending_cleaner_notes FOR ALL TO authenticated
  USING ((SELECT public.cros_is_staff())) WITH CHECK ((SELECT public.cros_is_staff()));

DROP POLICY IF EXISTS tenant_self_checks_admin_all ON public.tenant_self_checks;
DROP POLICY IF EXISTS "office manages tenant_self_checks" ON public.tenant_self_checks;
CREATE POLICY "office manages tenant_self_checks" ON public.tenant_self_checks FOR ALL TO authenticated
  USING ((SELECT public.cros_is_staff())) WITH CHECK ((SELECT public.cros_is_staff()));

DROP POLICY IF EXISTS tenant_icebreakers_admin_all ON public.tenant_icebreakers;
DROP POLICY IF EXISTS "office manages tenant_icebreakers" ON public.tenant_icebreakers;
CREATE POLICY "office manages tenant_icebreakers" ON public.tenant_icebreakers FOR ALL TO authenticated
  USING ((SELECT public.cros_is_staff())) WITH CHECK ((SELECT public.cros_is_staff()));

DROP POLICY IF EXISTS tenant_ack_notes_admin_all ON public.tenant_acknowledgment_notes;
DROP POLICY IF EXISTS "office manages tenant_acknowledgment_notes" ON public.tenant_acknowledgment_notes;
CREATE POLICY "office manages tenant_acknowledgment_notes" ON public.tenant_acknowledgment_notes FOR ALL TO authenticated
  USING ((SELECT public.cros_is_staff())) WITH CHECK ((SELECT public.cros_is_staff()));

-- cleaners: read every house's compliance log, add their own checks
DROP POLICY IF EXISTS "cleaners read compliance_logs" ON public.compliance_logs;
CREATE POLICY "cleaners read compliance_logs" ON public.compliance_logs FOR SELECT TO authenticated
  USING ((SELECT public.cros_my_role()) = 'cleaner');
DROP POLICY IF EXISTS "cleaners log their own checks" ON public.compliance_logs;
CREATE POLICY "cleaners log their own checks" ON public.compliance_logs FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.cros_my_role()) = 'cleaner' AND checked_by = (SELECT public.cros_me()));

-- icebreakers shared with housemates: only tenants, only the people at their own house
DROP POLICY IF EXISTS tenant_icebreakers_read_visible ON public.tenant_icebreakers;
CREATE POLICY tenant_icebreakers_read_visible ON public.tenant_icebreakers FOR SELECT TO authenticated
  USING (visible_to_housemates = true AND (SELECT public.cros_my_role()) = 'tenant'
         AND person_id IN (SELECT public.cros_visible_people()));

-- the job completion log: written as yourself (or by the office)
DROP POLICY IF EXISTS "signed-in users write completion log" ON public.job_completion_log;
CREATE POLICY "signed-in users write completion log" ON public.job_completion_log FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.cros_is_staff()) OR completed_by = (SELECT public.cros_me()));

-- SMS confirmations: the office only (the server, with its own key, is unaffected)
DROP POLICY IF EXISTS "staff manage sms_confirmations" ON public.sms_confirmations;
CREATE POLICY "staff manage sms_confirmations" ON public.sms_confirmations FOR ALL TO authenticated
  USING ((SELECT public.cros_is_staff())) WITH CHECK ((SELECT public.cros_is_staff()));
