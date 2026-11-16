-- 291 — Property checks (16 Nov 2026): reports on properties Capital Rooms doesn't manage yet — one address → EPC,
-- planning (Article 4, conservation, listed), licensing, flood, crime, sales, rents, yield and a written verdict
-- (lib/propertyCheck). Kept so the office can come back to them and compare. Office only. Idempotent.
CREATE TABLE IF NOT EXISTS public.property_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  address TEXT NOT NULL,
  postcode TEXT NOT NULL,
  report JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'interested', 'not_for_us')),
  notes TEXT,
  created_by UUID REFERENCES public.people(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS property_checks_created ON public.property_checks (created_at DESC);
ALTER TABLE public.property_checks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "office reads property_checks" ON public.property_checks;
CREATE POLICY "office reads property_checks" ON public.property_checks FOR SELECT TO authenticated USING ((SELECT public.cros_is_staff()));
