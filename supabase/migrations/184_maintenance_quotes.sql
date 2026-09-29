-- Migration 184: quotes from several contractors for one maintenance job.
--
-- Before this a job could hold ONE quote (maintenance_tickets.quote_* columns, one contractor_id).
-- Now each contractor asked gets a row here — on the app or not:
--   channel 'app'   → an existing contractor (people row); sees it in the contractor app Quotes tab + gets an email
--   channel 'email' → anyone else; gets the quote-request PDF by email and replies via a private link (token)
-- Accepting one quote declines the rest and assigns the job.
--
-- ADDITIVE ONLY. Idempotent: safe to run more than once. Needs cros_is_staff() from migration 183.

CREATE TABLE IF NOT EXISTS public.maintenance_quotes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id        UUID NOT NULL REFERENCES public.maintenance_tickets(id) ON DELETE CASCADE,
  contractor_id    UUID REFERENCES public.people(id) ON DELETE SET NULL,   -- null for someone not on the app (yet)
  contractor_name  TEXT NOT NULL,
  contractor_email TEXT,
  contractor_phone TEXT,
  channel          TEXT NOT NULL DEFAULT 'email' CHECK (channel IN ('app', 'email')),
  status           TEXT NOT NULL DEFAULT 'requested'
                   CHECK (status IN ('requested', 'submitted', 'accepted', 'declined', 'withdrawn')),
  message          TEXT,                     -- note from the office to the contractor
  amount           NUMERIC(10,2),
  notes            TEXT,                     -- contractor's notes with their price
  site_visit       BOOLEAN NOT NULL DEFAULT false,
  visit_date       DATE,
  entered_by_staff BOOLEAN NOT NULL DEFAULT false,  -- office typed in a quote given by phone/email
  token            TEXT UNIQUE,              -- private reply link for off-app contractors
  requested_by     UUID REFERENCES public.people(id) ON DELETE SET NULL,
  requested_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at          TIMESTAMPTZ,
  submitted_at     TIMESTAMPTZ,
  decided_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS maintenance_quotes_ticket_idx     ON public.maintenance_quotes (ticket_id);
CREATE INDEX IF NOT EXISTS maintenance_quotes_contractor_idx ON public.maintenance_quotes (contractor_id);
CREATE INDEX IF NOT EXISTS maintenance_quotes_status_idx     ON public.maintenance_quotes (status);

ALTER TABLE public.maintenance_quotes ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION pg_temp.ensure_policy(tbl text, pol text, ddl text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = tbl AND policyname = pol) THEN
    EXECUTE ddl;
  END IF;
END $$;

-- Staff manage everything. Contractors can read their own requests (writes go through the API).
SELECT pg_temp.ensure_policy('maintenance_quotes', 'staff manage maintenance_quotes',
  $p$CREATE POLICY "staff manage maintenance_quotes" ON public.maintenance_quotes FOR ALL TO authenticated USING (public.cros_is_staff()) WITH CHECK (public.cros_is_staff())$p$);
SELECT pg_temp.ensure_policy('maintenance_quotes', 'contractor reads own quotes',
  $p$CREATE POLICY "contractor reads own quotes" ON public.maintenance_quotes FOR SELECT TO authenticated USING (
    contractor_id IN (SELECT id FROM public.people WHERE lower(email) = lower(auth.jwt()->>'email'))
  )$p$);
