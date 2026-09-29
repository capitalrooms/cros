-- Migration 187: move-in document packs.
--
-- After referencing, the office sends the new tenant ONE link: tenancy agreement, check-in balance,
-- the property's gas / EICR / EPC certificates and the statutory and house guides. The tenant views or
-- downloads each one, then confirms they've read everything and are ready to sign.
-- Every open, download and the confirmation is logged with date, time and IP — evidence the documents
-- were served before signing.
--
-- ADDITIVE ONLY. Idempotent: safe to run more than once. Needs cros_is_staff() from migration 183.

CREATE TABLE IF NOT EXISTS public.tenancy_packs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenancy_id      UUID NOT NULL REFERENCES public.tenancies(id) ON DELETE CASCADE,
  token           TEXT NOT NULL UNIQUE,                    -- the private link
  tenant_name     TEXT NOT NULL,
  tenant_email    TEXT NOT NULL,
  documents       JSONB NOT NULL DEFAULT '[]'::jsonb,      -- [{ key, label, group, source, path|url, pending? }] as sent
  summary         JSONB NOT NULL DEFAULT '{}'::jsonb,      -- move-in money + dates as sent (first rent, deposit, amount due…)
  message         TEXT,
  status          TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'viewed', 'confirmed', 'withdrawn')),
  sent_by         UUID REFERENCES public.people(id) ON DELETE SET NULL,
  sent_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  first_viewed_at TIMESTAMPTZ,
  confirmed_at    TIMESTAMPTZ,
  confirmed_name  TEXT,
  confirmed_ip    TEXT,
  tenant_questions TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tenancy_packs_tenancy_idx ON public.tenancy_packs (tenancy_id);

CREATE TABLE IF NOT EXISTS public.tenancy_pack_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_id     UUID NOT NULL REFERENCES public.tenancy_packs(id) ON DELETE CASCADE,
  event       TEXT NOT NULL CHECK (event IN ('sent', 'viewed', 'opened_document', 'confirmed', 'withdrawn')),
  document_key TEXT,
  ip          TEXT,
  user_agent  TEXT,
  at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tenancy_pack_events_pack_idx ON public.tenancy_pack_events (pack_id, at);

ALTER TABLE public.tenancy_packs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenancy_pack_events ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION pg_temp.ensure_policy(tbl text, pol text, ddl text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = tbl AND policyname = pol) THEN
    EXECUTE ddl;
  END IF;
END $$;

-- Staff only through the browser; tenants reach their pack through the token API (service role).
SELECT pg_temp.ensure_policy('tenancy_packs', 'staff manage tenancy_packs',
  $p$CREATE POLICY "staff manage tenancy_packs" ON public.tenancy_packs FOR ALL TO authenticated USING (public.cros_is_staff()) WITH CHECK (public.cros_is_staff())$p$);
SELECT pg_temp.ensure_policy('tenancy_pack_events', 'staff read tenancy_pack_events',
  $p$CREATE POLICY "staff read tenancy_pack_events" ON public.tenancy_pack_events FOR SELECT TO authenticated USING (public.cros_is_staff())$p$);
