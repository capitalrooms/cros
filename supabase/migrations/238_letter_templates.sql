-- 238 — Letters you've written, kept as templates (22 Oct 2026, Harry: "once that is sent there is no way we can reuse
-- that … click on good letters and be like yes that is a good template … AI could give it a name and then it gets saved
-- to a list of letters to landlords or tenants or contractors"). Made from Letters & Invoices → "Save as a template":
-- the AI names it and swaps the one-off details (names, dates, amounts) for [placeholders].
-- The office only. Idempotent: safe to run more than once.
CREATE TABLE IF NOT EXISTS public.letter_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  audience TEXT NOT NULL DEFAULT 'tenant' CHECK (audience IN ('tenant', 'landlord', 'contractor', 'anyone')),
  subject TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL,
  closing TEXT NOT NULL DEFAULT 'Kind regards',
  source_document_id UUID,
  created_by UUID REFERENCES public.people(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

ALTER TABLE public.letter_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "office manages letter_templates" ON public.letter_templates;
CREATE POLICY "office manages letter_templates" ON public.letter_templates FOR ALL TO authenticated
  USING ((SELECT public.cros_is_staff())) WITH CHECK ((SELECT public.cros_is_staff()));
