-- 201 — Saved management agreements: every agreement generated on New Business › Management Agreement is kept as an
-- entry with everything that was typed (form), so it can be reopened, edited and generated again as a new version
-- rather than written out from scratch. The PDF of the latest version is kept too. "Delete" hides it from the list;
-- the record stays.

CREATE TABLE IF NOT EXISTS public.management_agreements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agreement_type  TEXT NOT NULL,
  client_name     TEXT NOT NULL DEFAULT '',
  properties      TEXT[] NOT NULL DEFAULT '{}',
  form            JSONB NOT NULL DEFAULT '{}'::jsonb,   -- the form as filled in, to reopen it exactly
  pdf_path        TEXT,                                -- latest version's PDF (valuations bucket)
  version         INT NOT NULL DEFAULT 1,
  onboarding_id   UUID,
  created_by      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by      TEXT,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ,
  deleted_by      TEXT
);
CREATE INDEX IF NOT EXISTS management_agreements_live_idx ON public.management_agreements (updated_at DESC) WHERE deleted_at IS NULL;

-- Office only, through the API (service key)
ALTER TABLE public.management_agreements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.management_agreements FROM anon;
