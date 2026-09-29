-- Migration 173: Compliance cert history + HMO licence history
-- Adds audit trail tables so cert renewals don't silently overwrite the previous record.

-- ── Compliance certificate history ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.compliance_cert_history (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id    UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  cert_type      TEXT NOT NULL,   -- 'gas_safe' | 'eicr' | 'pat' | 'fire_detection' | 'emergency_lighting' | 'fire_risk'
  issue_date     DATE,
  expiry_date    DATE,
  provider       TEXT,
  notes          TEXT,
  recorded_by    UUID REFERENCES public.people(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cch_property_id ON public.compliance_cert_history(property_id);
CREATE INDEX IF NOT EXISTS idx_cch_cert_type   ON public.compliance_cert_history(cert_type);
CREATE INDEX IF NOT EXISTS idx_cch_created_at  ON public.compliance_cert_history(created_at DESC);

ALTER TABLE public.compliance_cert_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_manage_cert_history" ON public.compliance_cert_history
  FOR ALL USING (
    EXISTS(SELECT 1 FROM people WHERE people.id = auth.uid() AND (people.role = 'administrator' OR people.role = 'admin'))
  );

-- ── HMO licence history ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.hmo_licence_history (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id    UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  licence_number TEXT,
  issue_date     DATE,
  expiry_date    DATE,
  issuing_authority TEXT,
  notes          TEXT,
  recorded_by    UUID REFERENCES public.people(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hlh_property_id ON public.hmo_licence_history(property_id);
CREATE INDEX IF NOT EXISTS idx_hlh_created_at  ON public.hmo_licence_history(created_at DESC);

ALTER TABLE public.hmo_licence_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_manage_hmo_licence_history" ON public.hmo_licence_history
  FOR ALL USING (
    EXISTS(SELECT 1 FROM people WHERE people.id = auth.uid() AND (people.role = 'administrator' OR people.role = 'admin'))
  );
