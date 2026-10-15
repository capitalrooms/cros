-- 224 — Key safe codes locked away, and "Popping by" visits (15 Oct 2026).
-- 1. Key safe codes move off the property record into property_access_codes, which only the office can read. Until
--    now any contractor who had ever had a job at a property could read its code straight from the database. The apps
--    now get a code from the server, and only when allowed (lib/access/keySafe): a booked job, a pop-by visit the
--    tenants have been told about, or an emergency they've been chosen for.
-- 2. property_visits — the log of unbooked visits: who, where, when, why, and how many tenants were told
--    (lib/access/visits). Contractors: shared areas only; the office may name a room.
-- ADDITIVE apart from emptying properties.key_safe_code once each code is copied. Idempotent: safe to run again.

CREATE TABLE IF NOT EXISTS public.property_access_codes (
  property_id   UUID PRIMARY KEY REFERENCES public.properties(id) ON DELETE CASCADE,
  key_safe_code TEXT,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by    UUID REFERENCES public.people(id) ON DELETE SET NULL
);
ALTER TABLE public.property_access_codes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "office manages key safe codes" ON public.property_access_codes;
CREATE POLICY "office manages key safe codes" ON public.property_access_codes FOR ALL TO authenticated
  USING (public.cros_is_staff()) WITH CHECK (public.cros_is_staff());
REVOKE ALL ON public.property_access_codes FROM anon;

-- copy the codes across, then take them off the property record
INSERT INTO public.property_access_codes (property_id, key_safe_code)
SELECT id, key_safe_code FROM public.properties WHERE NULLIF(trim(key_safe_code), '') IS NOT NULL
ON CONFLICT (property_id) DO UPDATE SET key_safe_code = COALESCE(public.property_access_codes.key_safe_code, EXCLUDED.key_safe_code);
UPDATE public.properties p SET key_safe_code = NULL
 WHERE p.key_safe_code IS NOT NULL
   AND EXISTS (SELECT 1 FROM public.property_access_codes c WHERE c.property_id = p.id AND c.key_safe_code IS NOT NULL);

CREATE TABLE IF NOT EXISTS public.property_visits (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id    UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  room_id        UUID REFERENCES public.rooms(id) ON DELETE SET NULL,
  visitor_id     UUID REFERENCES public.people(id) ON DELETE SET NULL,
  visitor_role   TEXT,
  visit_date     DATE NOT NULL,
  time_from      TEXT,
  time_to        TEXT,
  reason         TEXT NOT NULL,
  tenant_agreed  BOOLEAN NOT NULL DEFAULT false,
  notified       JSONB,
  key_safe_shown BOOLEAN NOT NULL DEFAULT false,
  cancelled_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS property_visits_property_idx ON public.property_visits (property_id, visit_date);
CREATE INDEX IF NOT EXISTS property_visits_visitor_idx ON public.property_visits (visitor_id, visit_date);
ALTER TABLE public.property_visits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "office reads visits" ON public.property_visits;
CREATE POLICY "office reads visits" ON public.property_visits FOR SELECT TO authenticated USING (public.cros_is_staff());
DROP POLICY IF EXISTS "visitors read their own visits" ON public.property_visits;
CREATE POLICY "visitors read their own visits" ON public.property_visits FOR SELECT TO authenticated USING (visitor_id = public.cros_me());
REVOKE ALL ON public.property_visits FROM anon;
