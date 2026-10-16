-- 225 — Faster row rules (16 Oct 2026, "cros is generally very laggy").
-- The row rules from migration 192 call helper functions — cros_is_staff(), cros_me(), cros_my_role(),
-- cros_is_admin(), cros_my_property_ids() — directly, so Postgres runs them once for EVERY row it looks at. The people
-- rule is the worst: cros_can_see_person(id) runs several look-ups per person, and every other rule that checks
-- "is this the office?" reads people, so a single-record fetch took 1.5–2s for a signed-in user (0.1s without rules).
--
-- This changes HOW the rules are worked out, not WHAT they allow:
--   1. every call of those helpers inside a rule is wrapped as (SELECT …) — Postgres then works it out once per query
--      (Supabase's own advice for row rules);
--   2. the people rule checks "is this the office?" first, once, before the per-person check (the office can see
--      everyone already — cros_can_see_person starts with the same check);
--   3. the old onboarding rule that looked people up by hand uses the same office check.
-- Idempotent: safe to run more than once.

-- 2. people: the office first, once
DROP POLICY IF EXISTS "people read what they should" ON public.people;
CREATE POLICY "people read what they should" ON public.people FOR SELECT TO authenticated
  USING ((SELECT public.cros_is_staff()) OR public.cros_can_see_person(id));

-- 3. onboarding: the office check, once
DROP POLICY IF EXISTS "landlord_onboarding_admin" ON public.landlord_onboarding;
CREATE POLICY "landlord_onboarding_admin" ON public.landlord_onboarding FOR ALL TO authenticated
  USING ((SELECT public.cros_is_staff())) WITH CHECK ((SELECT public.cros_is_staff()));

-- 1. every other rule: wrap the helper calls so each is worked out once per query
DO $$
DECLARE
  r RECORD;
  fn TEXT;
  q TEXT;
  c TEXT;
  stmt TEXT;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname, cmd, qual, with_check
      FROM pg_policies
     WHERE schemaname = 'public'
       AND (coalesce(qual, '') ~ 'cros_(is_staff|me|my_role|is_admin)\(\)' OR coalesce(with_check, '') ~ 'cros_(is_staff|me|my_role|is_admin)\(\)')
  LOOP
    q := r.qual; c := r.with_check;
    FOREACH fn IN ARRAY ARRAY['cros_is_staff', 'cros_me', 'cros_my_role', 'cros_is_admin'] LOOP
      -- "public.cros_is_staff()" or "cros_is_staff()", not already inside "(SELECT …)"
      IF q IS NOT NULL THEN
        q := regexp_replace(q, '(?<!SELECT )(public\.)?' || fn || '\(\)', '(SELECT public.' || fn || '())', 'g');
      END IF;
      IF c IS NOT NULL THEN
        c := regexp_replace(c, '(?<!SELECT )(public\.)?' || fn || '\(\)', '(SELECT public.' || fn || '())', 'g');
      END IF;
    END LOOP;
    IF q IS NOT DISTINCT FROM r.qual AND c IS NOT DISTINCT FROM r.with_check THEN CONTINUE; END IF;
    stmt := format('ALTER POLICY %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
    IF q IS NOT NULL AND r.cmd <> 'INSERT' THEN stmt := stmt || ' USING (' || q || ')'; END IF;
    IF c IS NOT NULL AND r.cmd <> 'SELECT' AND r.cmd <> 'DELETE' THEN stmt := stmt || ' WITH CHECK (' || c || ')'; END IF;
    IF stmt <> format('ALTER POLICY %I ON %I.%I', r.policyname, r.schemaname, r.tablename) THEN
      EXECUTE stmt;
    END IF;
  END LOOP;
END $$;
