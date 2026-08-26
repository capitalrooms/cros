-- Migration 080: tenant icebreaker questionnaire.
--
-- A light, informal profile each tenant fills in after signing up. Feeds the
-- housemate-facing "Meet your housemates" view and the admin house summary.
-- One row per person; answers stored as JSON keyed by question id so the
-- question set can evolve without a schema change.
-- Idempotent.

CREATE TABLE IF NOT EXISTS public.tenant_icebreakers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE UNIQUE,
  answers JSONB NOT NULL DEFAULT '{}'::jsonb,      -- { question_id: answer_text }
  visible_to_housemates BOOLEAN DEFAULT true,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenant_icebreakers_person ON public.tenant_icebreakers(person_id);

ALTER TABLE public.tenant_icebreakers ENABLE ROW LEVEL SECURITY;

-- Admins/landlords: full access (house summary + backfilling existing tenants).
DROP POLICY IF EXISTS tenant_icebreakers_admin_all ON public.tenant_icebreakers;
CREATE POLICY tenant_icebreakers_admin_all ON public.tenant_icebreakers
  FOR ALL TO authenticated
  USING ((SELECT role FROM public.people WHERE email = auth.jwt() ->> 'email') IN ('administrator','landlord','admin'))
  WITH CHECK ((SELECT role FROM public.people WHERE email = auth.jwt() ->> 'email') IN ('administrator','landlord','admin'));

-- Any signed-in user can READ profiles marked visible (housemates see each other).
DROP POLICY IF EXISTS tenant_icebreakers_read_visible ON public.tenant_icebreakers;
CREATE POLICY tenant_icebreakers_read_visible ON public.tenant_icebreakers
  FOR SELECT TO authenticated
  USING (visible_to_housemates = true);

-- A tenant can create/update their OWN profile.
DROP POLICY IF EXISTS tenant_icebreakers_own_write ON public.tenant_icebreakers;
CREATE POLICY tenant_icebreakers_own_write ON public.tenant_icebreakers
  FOR ALL TO authenticated
  USING (person_id = (SELECT id FROM public.people WHERE email = auth.jwt() ->> 'email'))
  WITH CHECK (person_id = (SELECT id FROM public.people WHERE email = auth.jwt() ->> 'email'));

NOTIFY pgrst, 'reload schema';
