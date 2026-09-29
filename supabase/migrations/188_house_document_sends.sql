-- Migration 188: log of documents emailed to a whole house (e.g. new gas / EICR / fire certificates).
-- Tenants must be given a copy of the gas safety record within 28 days of each check — this is the proof:
-- which documents, to whom, when, and whether each email went.
--
-- ADDITIVE ONLY. Idempotent: safe to run more than once. Needs cros_is_staff() from migration 183.

CREATE TABLE IF NOT EXISTS public.house_document_sends (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  subject     TEXT NOT NULL,
  documents   JSONB NOT NULL DEFAULT '[]'::jsonb,   -- [{ key, label, url, next_due }]
  recipients  JSONB NOT NULL DEFAULT '[]'::jsonb,   -- [{ person_id, name, email, ok, error? }]
  sent_by     UUID REFERENCES public.people(id) ON DELETE SET NULL,
  sent_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS house_document_sends_property_idx ON public.house_document_sends (property_id, sent_at DESC);

ALTER TABLE public.house_document_sends ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'house_document_sends' AND policyname = 'staff manage house_document_sends') THEN
    CREATE POLICY "staff manage house_document_sends" ON public.house_document_sends FOR ALL TO authenticated
      USING (public.cros_is_staff()) WITH CHECK (public.cros_is_staff());
  END IF;
END $$;
