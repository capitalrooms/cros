-- 302 · House jobs (shared, anyone in the house can tick off) and personal spending (private to the tenant) (21 Nov 2026).
-- Safe to run more than once. Only the server reads or writes these tables, so no browser policies are added.

-- Each time a house job is done: who did it, when, and for which house.
CREATE TABLE IF NOT EXISTS public.house_job_done (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id  UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  job_key      TEXT NOT NULL,
  done_by      UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  done_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_house_job_done ON public.house_job_done (property_id, job_key, done_at DESC);
ALTER TABLE public.house_job_done ENABLE ROW LEVEL SECURITY;

-- What a tenant has bought for the house. Private: the person who bought it, and the office, can see it. Never shown to housemates.
CREATE TABLE IF NOT EXISTS public.personal_spending (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id    UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  property_id  UUID REFERENCES public.properties(id) ON DELETE SET NULL,
  description  TEXT NOT NULL,
  amount_gbp   NUMERIC(10,2),
  bought_on    DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_personal_spending_person ON public.personal_spending (person_id, bought_on DESC);
ALTER TABLE public.personal_spending ENABLE ROW LEVEL SECURITY;
