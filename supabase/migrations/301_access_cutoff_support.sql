-- 301 · Support for the 30-day access cutoff (21 Nov 2026). Safe to run more than once. Changes no existing rows.

-- 1. Fast lookup of tenancies by person and end date (the cutoff job checks these every day).
CREATE INDEX IF NOT EXISTS idx_tenancies_person_end ON public.tenancies (person_id, end_date);
CREATE INDEX IF NOT EXISTS idx_tenancies_cojoint_end ON public.tenancies (co_tenant_id, end_date);

-- 2. A record of every access change made by the cutoff (who, when, why), so any change can be traced and undone.
CREATE TABLE IF NOT EXISTS public.access_changes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id   UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  from_role   TEXT,
  to_role     TEXT NOT NULL,
  reason      TEXT NOT NULL,
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  reverted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_access_changes_person ON public.access_changes (person_id, changed_at DESC);
ALTER TABLE public.access_changes ENABLE ROW LEVEL SECURITY;
-- No browser policies: only the server (service role) reads or writes this table.
