-- 226 — Row rules fast for cleaners, contractors, tenants and landlords too (16 Oct 2026).
--
-- Signed in as the test cleaner / contractor, reading people, compliance_logs or landlord_statements was cancelled
-- by the database's time limit (8s) — the cleaner's Compliance tab would never load. Migration 225 made the office
-- fast (the office check comes first and short-cuts everything); everyone else still ran cros_can_see_person(id)
-- for EVERY person record, and each run looks "me" up by email ~10 times by reading the whole people table.
--
-- This changes HOW it's worked out, not WHO can see what:
--   1. an index for the "who am I" look-up (lower(email));
--   2. cros_my_property_ids() works out "me" once instead of five times;
--   3. the people rule uses cros_visible_people() — the same people cros_can_see_person allows, worked out once per
--      query as a set, instead of once per record;
--   4. cleans: contractors no longer see the cleaning rota of a house they have a job at (cleaners, the house's
--      tenants and landlord, and the office are unchanged).
-- Idempotent: safe to run more than once.

-- 1. "who am I" by email, without reading every person
CREATE INDEX IF NOT EXISTS people_lower_email_idx ON public.people (lower(email));

-- 2. properties I have a reason to see — "me" worked out once
CREATE OR REPLACE FUNCTION public.cros_my_property_ids() RETURNS SETOF UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH me AS (SELECT public.cros_me() AS id)
  SELECT t.property_id FROM public.tenancies t, me
   WHERE (t.person_id = me.id OR t.co_tenant_id = me.id)
     AND t.start_date <= current_date + 60 AND (t.end_date IS NULL OR t.end_date >= current_date - 30)
  UNION SELECT p.id FROM public.properties p, me WHERE p.landlord_id = me.id
  UNION SELECT m.property_id FROM public.maintenance_tickets m, me WHERE m.contractor_id = me.id AND m.property_id IS NOT NULL
  UNION SELECT c.property_id FROM public.cleans c, me WHERE c.cleaner_id = me.id AND c.property_id IS NOT NULL
$$;

-- 3. the people I may see, as one set (exactly the cases in cros_can_see_person, apart from the office and "me",
--    which the rule checks first)
CREATE OR REPLACE FUNCTION public.cros_visible_people() RETURNS SETOF UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH props AS (SELECT public.cros_my_property_ids() AS pid),
       tenant AS (SELECT public.cros_my_role() = 'tenant' AS yes)
  -- the office team (names and contact details are business contacts)
  SELECT id FROM public.people WHERE role IN ('administrator', 'admin', 'lettings')
  -- people living at a property I live at / own / work at
  UNION SELECT t.person_id FROM public.tenancies t
         WHERE t.property_id IN (SELECT pid FROM props) AND (t.end_date IS NULL OR t.end_date >= current_date - 30)
  UNION SELECT t.co_tenant_id FROM public.tenancies t
         WHERE t.co_tenant_id IS NOT NULL AND t.property_id IN (SELECT pid FROM props) AND (t.end_date IS NULL OR t.end_date >= current_date - 30)
  -- tenants can see the contractor / cleaner coming to their house
  UNION SELECT m.contractor_id FROM public.maintenance_tickets m, tenant
         WHERE tenant.yes AND m.contractor_id IS NOT NULL AND m.property_id IN (SELECT pid FROM props)
  UNION SELECT c.cleaner_id FROM public.cleans c, tenant
         WHERE tenant.yes AND c.cleaner_id IS NOT NULL AND c.property_id IN (SELECT pid FROM props)
$$;
REVOKE EXECUTE ON FUNCTION public.cros_visible_people() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cros_visible_people() TO authenticated, service_role;

DROP POLICY IF EXISTS "people read what they should" ON public.people;
CREATE POLICY "people read what they should" ON public.people FOR SELECT TO authenticated
  USING ((SELECT public.cros_is_staff()) OR id = (SELECT public.cros_me()) OR id IN (SELECT public.cros_visible_people()));

-- 4. cleans: the cleaner(s), the house (tenants, landlord) and the office — not contractors
DROP POLICY IF EXISTS "cleans read by the cleaner, the house and office" ON public.cleans;
CREATE POLICY "cleans read by the cleaner, the house and office" ON public.cleans FOR SELECT TO authenticated
  USING ((SELECT public.cros_is_staff()) OR (SELECT public.cros_my_role()) = 'cleaner' OR cleaner_id = (SELECT public.cros_me())
         OR ((SELECT public.cros_my_role()) IN ('tenant', 'landlord') AND property_id IN (SELECT public.cros_my_property_ids())));
