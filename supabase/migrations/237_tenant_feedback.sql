-- 237 — Tenant feedback (22 Oct 2026, Harry: "a short questionnaire on the property, how is this area 1-5, how can it
-- be improved … then AI gets all their filled in forms and summarises what they think would be the best ways to
-- improve the house"). Sent from Quick Notify → Feedback; filled in at /tenant/feedback; read at /admin/feedback.
--
-- One row per answer form. Scores are 1–5 per area ({"kitchen": 4, …}); "how could it be better" notes per area in
-- comments. Tenants add and read their own; the office reads everything. Answers never go to housemates or landlords.
-- Idempotent: safe to run more than once.
CREATE TABLE IF NOT EXISTS public.tenant_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  person_id UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  tenancy_id UUID REFERENCES public.tenancies(id) ON DELETE SET NULL,
  ratings JSONB NOT NULL DEFAULT '{}'::jsonb,
  comments JSONB NOT NULL DEFAULT '{}'::jsonb,
  anything_else TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tenant_feedback_property ON public.tenant_feedback (property_id, created_at DESC);

ALTER TABLE public.tenant_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "office manages tenant_feedback" ON public.tenant_feedback;
CREATE POLICY "office manages tenant_feedback" ON public.tenant_feedback FOR ALL TO authenticated
  USING ((SELECT public.cros_is_staff())) WITH CHECK ((SELECT public.cros_is_staff()));

DROP POLICY IF EXISTS "tenants read their own feedback" ON public.tenant_feedback;
CREATE POLICY "tenants read their own feedback" ON public.tenant_feedback FOR SELECT TO authenticated
  USING (person_id = (SELECT public.cros_me()));

DROP POLICY IF EXISTS "tenants add their own feedback" ON public.tenant_feedback;
CREATE POLICY "tenants add their own feedback" ON public.tenant_feedback FOR INSERT TO authenticated
  WITH CHECK (person_id = (SELECT public.cros_me()));
